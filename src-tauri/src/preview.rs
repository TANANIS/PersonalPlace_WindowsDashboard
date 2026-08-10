use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewPayload {
    pub data_url: String,
    pub kind: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PreviewAsset {
    pub bytes: Vec<u8>,
    pub mime_type: String,
    pub kind: String,
}

#[derive(Deserialize, Serialize)]
struct CachedPreview {
    version: u8,
    fingerprint: String,
    kind: String,
    mime_type: String,
    file_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewCacheInfo {
    pub entries: u64,
    pub bytes: u64,
}

const CACHE_VERSION: u8 = 4;
const REMOTE_ICON_FINGERPRINT: &str = "url-metadata-icon-v1";

const TEXT_EXTENSIONS: &[&str] = &[
    "txt", "md", "log", "ini", "cfg", "conf", "json", "toml", "yaml", "yml", "xml", "html", "htm",
    "css", "js", "jsx", "ts", "tsx", "rs", "py", "java", "c", "h", "cpp", "hpp", "cs", "go", "php",
    "sql", "csv",
];

const THUMBNAIL_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "tif", "tiff", "heic", "mp4", "mkv",
    "mov", "webm", "avi", "wmv", "m4v", "lnk",
];

pub fn load_or_generate_cached(
    cache_dir: &Path,
    cache_key: &str,
    source_path: &Path,
) -> Result<Option<PreviewAsset>, String> {
    fs::create_dir_all(cache_dir).map_err(|error| format!("無法建立縮圖儲存區：{error}"))?;
    let cache_path = cache_dir.join(format!("{cache_key}.json"));
    let fingerprint = source_fingerprint(source_path)?;

    if let Ok(content) = fs::read_to_string(&cache_path) {
        if let Ok(cached) = serde_json::from_str::<CachedPreview>(&content) {
            if cached.version == CACHE_VERSION && cached.fingerprint == fingerprint {
                if let Ok(bytes) = fs::read(cache_dir.join(&cached.file_name)) {
                    return Ok(Some(PreviewAsset {
                        bytes,
                        mime_type: cached.mime_type,
                        kind: cached.kind,
                    }));
                }
            }
            let _ = fs::remove_file(cache_dir.join(cached.file_name));
        }
        let _ = fs::remove_file(&cache_path);
    }

    let Some(preview) = generate_preview(source_path)? else {
        return Ok(None);
    };
    let asset = decode_preview(preview)?;
    let file_name = format!("{cache_key}.{}", extension_for_mime(&asset.mime_type));
    fs::write(cache_dir.join(&file_name), &asset.bytes)
        .map_err(|error| format!("無法保存縮圖檔案：{error}"))?;
    let document = CachedPreview {
        version: CACHE_VERSION,
        fingerprint,
        kind: asset.kind.clone(),
        mime_type: asset.mime_type.clone(),
        file_name,
    };
    let content =
        serde_json::to_vec(&document).map_err(|error| format!("無法整理縮圖快取：{error}"))?;
    fs::write(&cache_path, content).map_err(|error| format!("無法保存縮圖快取：{error}"))?;

    Ok(Some(asset))
}

pub fn store_remote_icon(
    cache_dir: &Path,
    cache_key: &str,
    mime_type: &str,
    bytes: &[u8],
) -> Result<(), String> {
    fs::create_dir_all(cache_dir).map_err(|error| format!("無法建立縮圖儲存區：{error}"))?;
    remove_cached_preview(cache_dir, cache_key)?;
    let normalized_mime = normalize_image_mime(mime_type);
    let file_name = format!("{cache_key}.{}", extension_for_mime(normalized_mime));
    fs::write(cache_dir.join(&file_name), bytes)
        .map_err(|error| format!("無法保存網站圖示檔案：{error}"))?;
    let document = CachedPreview {
        version: CACHE_VERSION,
        fingerprint: REMOTE_ICON_FINGERPRINT.to_string(),
        kind: "icon".to_string(),
        mime_type: normalized_mime.to_string(),
        file_name,
    };
    let content =
        serde_json::to_vec(&document).map_err(|error| format!("無法整理網站圖示快取：{error}"))?;
    fs::write(cache_dir.join(format!("{cache_key}.json")), content)
        .map_err(|error| format!("無法保存網站圖示快取：{error}"))
}

pub fn load_remote_icon(cache_dir: &Path, cache_key: &str) -> Result<Option<PreviewAsset>, String> {
    let cache_path = cache_dir.join(format!("{cache_key}.json"));
    let content = match fs::read_to_string(cache_path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("無法讀取網站圖示快取：{error}")),
    };
    let cached: CachedPreview = match serde_json::from_str(&content) {
        Ok(cached) => cached,
        Err(_) => return Ok(None),
    };
    if cached.version == CACHE_VERSION && cached.fingerprint == REMOTE_ICON_FINGERPRINT {
        let bytes = match fs::read(cache_dir.join(&cached.file_name)) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(format!("無法讀取網站圖示檔案：{error}")),
        };
        Ok(Some(PreviewAsset {
            bytes,
            mime_type: cached.mime_type,
            kind: cached.kind,
        }))
    } else {
        Ok(None)
    }
}

pub fn generic_web_asset() -> Result<PreviewAsset, String> {
    decode_preview(generic_web_icon())
}

pub fn generic_web_icon() -> PreviewPayload {
    const SVG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#102735"/><circle cx="32" cy="32" r="18" fill="none" stroke="#67d7ff" stroke-width="4"/><path d="M14 32h36M32 14c6 6 9 12 9 18s-3 12-9 18c-6-6-9-12-9-18s3-12 9-18z" fill="none" stroke="#67d7ff" stroke-width="3"/></svg>"##;
    PreviewPayload {
        data_url: format!(
            "data:image/svg+xml;base64,{}",
            STANDARD.encode(SVG.as_bytes())
        ),
        kind: "icon".to_string(),
    }
}

fn decode_preview(preview: PreviewPayload) -> Result<PreviewAsset, String> {
    let Some((metadata, encoded)) = preview.data_url.split_once(',') else {
        return Err("預覽資料格式無效。".to_string());
    };
    let mime_type = metadata
        .strip_prefix("data:")
        .and_then(|value| value.strip_suffix(";base64"))
        .ok_or_else(|| "預覽資料不是支援的 Base64 圖片。".to_string())?;
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|error| format!("無法解碼預覽圖片：{error}"))?;
    Ok(PreviewAsset {
        bytes,
        mime_type: normalize_image_mime(mime_type).to_string(),
        kind: preview.kind,
    })
}

fn normalize_image_mime(mime_type: &str) -> &str {
    match mime_type.trim().to_ascii_lowercase().as_str() {
        "image/svg+xml" => "image/svg+xml",
        "image/jpeg" | "image/jpg" => "image/jpeg",
        "image/gif" => "image/gif",
        "image/webp" => "image/webp",
        "image/x-icon" | "image/vnd.microsoft.icon" => "image/x-icon",
        _ => "image/png",
    }
}

fn extension_for_mime(mime_type: &str) -> &'static str {
    match mime_type {
        "image/svg+xml" => "svg",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/x-icon" => "ico",
        _ => "png",
    }
}

pub fn preview_kind_hint(path: &Path) -> String {
    if path.is_file() && has_extension(path, TEXT_EXTENSIONS) {
        "text".to_string()
    } else if path.is_file() && has_extension(path, THUMBNAIL_EXTENSIONS) {
        "thumbnail".to_string()
    } else {
        "icon".to_string()
    }
}

pub fn remove_cached_preview(cache_dir: &Path, cache_key: &str) -> Result<(), String> {
    let cache_path = cache_dir.join(format!("{cache_key}.json"));
    if let Ok(content) = fs::read_to_string(&cache_path) {
        if let Ok(cached) = serde_json::from_str::<CachedPreview>(&content) {
            let asset_path = cache_dir.join(cached.file_name);
            if asset_path.exists() {
                fs::remove_file(asset_path)
                    .map_err(|error| format!("無法更新縮圖檔案：{error}"))?;
            }
        }
    }
    if cache_path.exists() {
        fs::remove_file(cache_path).map_err(|error| format!("無法更新縮圖快取：{error}"))?;
    }
    Ok(())
}

pub fn cache_info(cache_dir: &Path) -> Result<PreviewCacheInfo, String> {
    let entries = cache_files(cache_dir)?;
    Ok(PreviewCacheInfo {
        entries: entries.len() as u64,
        bytes: entries.iter().map(|entry| entry.1).sum(),
    })
}

pub fn clear_cache(cache_dir: &Path) -> Result<(), String> {
    if !cache_dir.exists() {
        fs::create_dir_all(cache_dir).map_err(|error| format!("無法建立縮圖儲存區：{error}"))?;
        return Ok(());
    }

    for entry in fs::read_dir(cache_dir).map_err(|error| format!("無法讀取縮圖儲存區：{error}"))?
    {
        let entry = entry.map_err(|error| format!("無法讀取縮圖項目：{error}"))?;
        if entry
            .file_type()
            .map_err(|error| format!("無法辨識縮圖項目：{error}"))?
            .is_file()
        {
            fs::remove_file(entry.path()).map_err(|error| format!("無法清除縮圖項目：{error}"))?;
        }
    }
    Ok(())
}

fn source_fingerprint(path: &Path) -> Result<String, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("無法讀取預覽來源資訊 {}：{error}", path.display()))?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    Ok(format!(
        "{}:{}:{}",
        if metadata.is_dir() { "dir" } else { "file" },
        metadata.len(),
        modified
    ))
}

pub fn preview_version_hint(path: &Path) -> String {
    source_fingerprint(path).unwrap_or_else(|_| "unavailable".to_string())
}

fn cache_files(cache_dir: &Path) -> Result<Vec<(PathBuf, u64)>, String> {
    if !cache_dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(cache_dir).map_err(|error| format!("無法讀取縮圖儲存區：{error}"))?
    {
        let entry = entry.map_err(|error| format!("無法讀取縮圖項目：{error}"))?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let metadata = entry
            .metadata()
            .map_err(|error| format!("無法讀取縮圖大小：{error}"))?;
        if metadata.is_file() {
            let asset_bytes = fs::read_to_string(&path)
                .ok()
                .and_then(|content| serde_json::from_str::<CachedPreview>(&content).ok())
                .and_then(|cached| fs::metadata(cache_dir.join(cached.file_name)).ok())
                .map(|metadata| metadata.len())
                .unwrap_or_default();
            entries.push((path, metadata.len() + asset_bytes));
        }
    }
    Ok(entries)
}

pub fn generate_preview(path: &Path) -> Result<Option<PreviewPayload>, String> {
    if path.is_file() && has_extension(path, TEXT_EXTENSIONS) {
        return text_preview(path).map(Some);
    }

    shell_preview(path)
}

fn has_extension(path: &Path, extensions: &[&str]) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|extension| {
            extensions
                .iter()
                .any(|candidate| extension.eq_ignore_ascii_case(candidate))
        })
        .unwrap_or(false)
}

fn text_preview(path: &Path) -> Result<PreviewPayload, String> {
    let mut file = File::open(path)
        .map_err(|error| format!("無法讀取文字預覽 {}：{error}", path.display()))?;
    let mut bytes = Vec::new();
    file.by_ref()
        .take(16 * 1024)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("無法讀取文字預覽 {}：{error}", path.display()))?;

    let content = String::from_utf8_lossy(&bytes);
    let lines = preview_lines(&content);
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("TEXT")
        .to_ascii_uppercase();
    let mut text_nodes = String::new();

    for (index, line) in lines.iter().enumerate() {
        let y = 68 + index * 20;
        text_nodes.push_str(&format!(
            r##"<text x="24" y="{y}" fill="#b7c2d2" font-size="13" font-family="Consolas, 'Microsoft JhengHei', monospace">{}</text>"##,
            escape_xml(line)
        ));
    }

    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 360 220">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#182231"/><stop offset="1" stop-color="#0d121b"/></linearGradient></defs>
<rect width="360" height="220" rx="18" fill="url(#bg)"/>
<rect x="1" y="1" width="358" height="218" rx="17" fill="none" stroke="#ffffff" stroke-opacity=".08"/>
<text x="24" y="34" fill="#65dff5" font-size="11" font-weight="700" font-family="Segoe UI, sans-serif" letter-spacing="2">{extension}</text>
<line x1="24" y1="48" x2="336" y2="48" stroke="#ffffff" stroke-opacity=".08"/>
{text_nodes}
</svg>"##
    );

    Ok(PreviewPayload {
        data_url: format!(
            "data:image/svg+xml;base64,{}",
            STANDARD.encode(svg.as_bytes())
        ),
        kind: "text".to_string(),
    })
}

fn preview_lines(content: &str) -> Vec<String> {
    let mut lines = Vec::new();

    for source_line in content.lines() {
        let cleaned: String = source_line
            .chars()
            .filter(|character| !character.is_control() || *character == '\t')
            .collect::<String>()
            .replace('\t', "    ");
        let cleaned = cleaned.trim_end();
        if cleaned.is_empty() && lines.is_empty() {
            continue;
        }

        let mut line: String = cleaned.chars().take(38).collect();
        if cleaned.chars().count() > 38 {
            line.push('…');
        }
        lines.push(line);
        if lines.len() == 7 {
            break;
        }
    }

    if lines.is_empty() {
        lines.push("（空白文字檔）".to_string());
    }
    lines
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(windows)]
fn shell_parsing_name(path: &Path) -> String {
    let value = path.as_os_str().to_string_lossy();
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = value.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        value.into_owned()
    }
}

#[cfg(windows)]
fn shell_preview(path: &Path) -> Result<Option<PreviewPayload>, String> {
    use image::{codecs::png::PngEncoder, ColorType, ImageEncoder};
    use std::{ffi::c_void, io::Cursor, mem::size_of};
    use windows::{
        core::HSTRING,
        Win32::{
            Foundation::SIZE,
            Graphics::Gdi::{
                DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
                BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HGDIOBJ,
            },
            System::Com::{CoInitializeEx, CoUninitialize, IBindCtx, COINIT_APARTMENTTHREADED},
            UI::Shell::{
                IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_ICONONLY,
                SIIGBF_THUMBNAILONLY,
            },
        },
    };

    struct ComGuard;
    impl Drop for ComGuard {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }

    struct BitmapGuard(HBITMAP);
    impl Drop for BitmapGuard {
        fn drop(&mut self) {
            unsafe {
                let _ = DeleteObject(HGDIOBJ(self.0 .0));
            }
        }
    }

    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            .ok()
            .map_err(|error| format!("無法初始化 Windows 縮圖服務：{error}"))?;
    }
    let _com_guard = ComGuard;

    let path_string = HSTRING::from(shell_parsing_name(path));
    let factory: IShellItemImageFactory = unsafe {
        SHCreateItemFromParsingName(&path_string, None::<&IBindCtx>)
            .map_err(|error| format!("Windows 無法辨識此項目的圖示：{error}"))?
    };
    let wants_thumbnail = has_extension(path, THUMBNAIL_EXTENSIONS);
    let (bitmap, preview_kind) = unsafe {
        if wants_thumbnail {
            match factory.GetImage(SIZE { cx: 360, cy: 220 }, SIIGBF_THUMBNAILONLY) {
                Ok(bitmap) => (bitmap, "thumbnail"),
                Err(_) => (
                    factory
                        .GetImage(SIZE { cx: 96, cy: 96 }, SIIGBF_ICONONLY)
                        .map_err(|error| format!("Windows 無法取得項目圖示：{error}"))?,
                    "icon",
                ),
            }
        } else {
            (
                factory
                    .GetImage(SIZE { cx: 96, cy: 96 }, SIIGBF_ICONONLY)
                    .map_err(|error| format!("Windows 無法取得項目圖示：{error}"))?,
                "icon",
            )
        }
    };
    let bitmap = BitmapGuard(bitmap);

    let mut bitmap_info = BITMAP::default();
    let object_size = unsafe {
        GetObjectW(
            HGDIOBJ(bitmap.0 .0),
            size_of::<BITMAP>() as i32,
            Some((&mut bitmap_info as *mut BITMAP).cast::<c_void>()),
        )
    };
    if object_size == 0 {
        return Err("無法讀取 Windows 縮圖尺寸。".to_string());
    }

    let width = bitmap_info.bmWidth.unsigned_abs();
    let height = bitmap_info.bmHeight.unsigned_abs();
    if width == 0 || height == 0 {
        return Ok(None);
    }

    let mut pixels = vec![0_u8; width as usize * height as usize * 4];
    let mut dib = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width as i32,
            biHeight: -(height as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };

    let device_context = unsafe { GetDC(None) };
    if device_context.0.is_null() {
        return Err("無法建立 Windows 縮圖繪圖環境。".to_string());
    }
    let copied_lines = unsafe {
        GetDIBits(
            device_context,
            bitmap.0,
            0,
            height,
            Some(pixels.as_mut_ptr().cast::<c_void>()),
            &mut dib,
            DIB_RGB_COLORS,
        )
    };
    unsafe {
        let _ = ReleaseDC(None, device_context);
    }
    if copied_lines == 0 {
        return Err("Windows 無法輸出縮圖像素。".to_string());
    }

    let has_alpha = pixels.chunks_exact(4).any(|pixel| pixel[3] != 0);
    for pixel in pixels.chunks_exact_mut(4) {
        pixel.swap(0, 2);
        if !has_alpha {
            pixel[3] = 255;
        }
    }

    let mut png = Cursor::new(Vec::new());
    PngEncoder::new(&mut png)
        .write_image(&pixels, width, height, ColorType::Rgba8.into())
        .map_err(|error| format!("無法編碼 Windows 縮圖：{error}"))?;

    Ok(Some(PreviewPayload {
        data_url: format!(
            "data:image/png;base64,{}",
            STANDARD.encode(png.into_inner())
        ),
        kind: preview_kind.to_string(),
    }))
}

#[cfg(not(windows))]
fn shell_preview(_path: &Path) -> Result<Option<PreviewPayload>, String> {
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_preview_escapes_markup() {
        assert_eq!(escape_xml("<tag>&\"'"), "&lt;tag&gt;&amp;&quot;&apos;");
    }

    #[test]
    fn preview_lines_are_bounded() {
        let content = "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight";
        assert_eq!(preview_lines(content).len(), 7);
    }

    #[test]
    fn text_files_generate_an_svg_preview() {
        let path = std::env::temp_dir().join(format!(
            "personal-workspace-preview-{}.txt",
            std::process::id()
        ));
        std::fs::write(&path, "第一行\n第二行 <safe>").expect("write preview fixture");

        let preview = generate_preview(&path)
            .expect("generate text preview")
            .expect("text preview exists");

        assert_eq!(preview.kind, "text");
        assert!(preview.data_url.starts_with("data:image/svg+xml;base64,"));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn disk_cache_persists_refreshes_and_clears() {
        let root = std::env::temp_dir().join(format!(
            "personal-workspace-cache-test-{}",
            std::process::id()
        ));
        let cache_dir = root.join("cache");
        let source = root.join("notes.txt");
        std::fs::create_dir_all(&root).expect("create cache fixture directory");
        std::fs::write(&source, "first version").expect("write first source version");

        let first = load_or_generate_cached(&cache_dir, "fixture", &source)
            .expect("generate first cached preview")
            .expect("first cached preview exists");
        let stored = cache_info(&cache_dir).expect("read populated cache info");
        assert_eq!(stored.entries, 1);
        assert!(stored.bytes > 0);

        let second = load_or_generate_cached(&cache_dir, "fixture", &source)
            .expect("read cached preview")
            .expect("cached preview exists");
        assert_eq!(first.bytes, second.bytes);
        assert_eq!(first.mime_type, "image/svg+xml");
        let metadata =
            std::fs::read_to_string(cache_dir.join("fixture.json")).expect("read cache metadata");
        assert!(!metadata.contains("base64"));
        assert!(cache_dir.join("fixture.svg").exists());

        std::fs::write(&source, "second and longer version").expect("write changed source version");
        let refreshed = load_or_generate_cached(&cache_dir, "fixture", &source)
            .expect("refresh changed preview")
            .expect("refreshed preview exists");
        assert_ne!(first.bytes, refreshed.bytes);

        clear_cache(&cache_dir).expect("clear preview cache");
        assert_eq!(cache_info(&cache_dir).expect("read empty cache").entries, 0);
        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(windows)]
    #[test]
    fn windows_executables_generate_a_system_icon() {
        let path = std::env::current_exe().expect("current test executable path");
        let preview = generate_preview(&path)
            .expect("generate Windows executable icon")
            .expect("Windows executable icon exists");

        assert_eq!(preview.kind, "icon");
        assert!(preview.data_url.starts_with("data:image/png;base64,"));
    }

    #[cfg(windows)]
    #[test]
    fn windows_images_generate_a_thumbnail() {
        let path = std::env::temp_dir().join(format!(
            "personal-workspace-thumbnail-{}.png",
            std::process::id()
        ));
        let pixels = [80_u8, 180, 240, 255].repeat(64 * 48);
        image::save_buffer(&path, &pixels, 64, 48, image::ColorType::Rgba8)
            .expect("write image fixture");

        let preview = generate_preview(&path)
            .expect("generate Windows image thumbnail")
            .expect("Windows image thumbnail exists");

        assert_eq!(preview.kind, "thumbnail");
        assert!(preview.data_url.starts_with("data:image/png;base64,"));
        let _ = std::fs::remove_file(path);
    }

    #[cfg(windows)]
    #[test]
    fn windows_extended_length_paths_generate_a_thumbnail() {
        let path = std::env::temp_dir().join(format!(
            "personal-workspace-extended-path-{}.png",
            std::process::id()
        ));
        let pixels = [40_u8, 210, 150, 255].repeat(64 * 48);
        image::save_buffer(&path, &pixels, 64, 48, image::ColorType::Rgba8)
            .expect("write extended path fixture");
        let canonical_path = std::fs::canonicalize(&path).expect("canonicalize image fixture");
        assert!(canonical_path.to_string_lossy().starts_with(r"\\?\"));

        let preview = generate_preview(&canonical_path)
            .expect("generate extended path thumbnail")
            .expect("extended path thumbnail exists");

        assert_eq!(preview.kind, "thumbnail");
        let _ = std::fs::remove_file(path);
    }

    #[cfg(windows)]
    #[test]
    fn shell_paths_remove_extended_prefixes() {
        assert_eq!(
            shell_parsing_name(Path::new(r"\\?\C:\Users\Example\image.png")),
            r"C:\Users\Example\image.png"
        );
        assert_eq!(
            shell_parsing_name(Path::new(r"\\?\UNC\server\share\image.png")),
            r"\\server\share\image.png"
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_image_shortcuts_generate_a_target_thumbnail() {
        let root = std::env::temp_dir().join(format!(
            "personal-workspace-shortcut-test-{}",
            std::process::id()
        ));
        let image_path = root.join("picture.png");
        let shortcut_path = root.join("picture.lnk");
        std::fs::create_dir_all(&root).expect("create shortcut fixture directory");
        let pixels = [220_u8, 90, 130, 255].repeat(80 * 60);
        image::save_buffer(&image_path, &pixels, 80, 60, image::ColorType::Rgba8)
            .expect("write shortcut target image");

        let status = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "$w = New-Object -ComObject WScript.Shell; $s = $w.CreateShortcut($env:PW_SHORTCUT_PATH); $s.TargetPath = $env:PW_TARGET_PATH; $s.Save()",
            ])
            .env("PW_SHORTCUT_PATH", &shortcut_path)
            .env("PW_TARGET_PATH", &image_path)
            .status()
            .expect("create Windows shortcut fixture");
        assert!(status.success());

        let canonical_shortcut =
            std::fs::canonicalize(&shortcut_path).expect("canonicalize shortcut fixture");
        let preview = generate_preview(&canonical_shortcut)
            .expect("generate Windows shortcut thumbnail")
            .expect("Windows shortcut thumbnail exists");

        assert_eq!(preview.kind, "thumbnail");
        assert!(preview.data_url.starts_with("data:image/png;base64,"));
        let _ = std::fs::remove_dir_all(root);
    }
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardEntry {
    pub id: i64,
    pub kind: String,
    pub content: Option<String>,
    pub thumbnail: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub hash: String,
    pub created_at: i64,
    pub last_used_at: i64,
    pub pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    En,
    De,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Dark,
    Light,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum WindowPositionMode {
    Cursor,
    Last,
}

impl Default for WindowPositionMode {
    fn default() -> Self { WindowPositionMode::Cursor }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub shortcut: String,
    pub max_entries: i64,
    pub language: Option<Language>,
    pub theme: Theme,
    pub autostart: bool,
    pub delete_after_max_entries: bool,
    pub delete_after_days: bool,
    pub max_days: i64,
    pub window_position: WindowPositionMode,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            shortcut: "Ctrl+Quote".to_string(),
            max_entries: 20,
            language: None,
            theme: Theme::System,
            autostart: false,
            delete_after_max_entries: true,
            delete_after_days: false,
            max_days: 30,
            window_position: WindowPositionMode::Cursor,
        }
    }
}

/// Internal payload produced by the clipboard monitor
#[derive(Debug, Clone)]
pub enum ClipboardContent {
    Text(String),
    Image {
        rgba_bytes: Vec<u8>,
        width: u32,
        height: u32,
    },
}

#[derive(Debug, Clone)]
pub struct ClipboardPayload {
    pub content: ClipboardContent,
    pub hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub created_at: i64,
    pub sort_order: i64,
}

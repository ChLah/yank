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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub shortcut: String,
    pub max_entries: i64,
    pub language: Option<Language>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            shortcut: "Ctrl+Quote".to_string(),
            max_entries: 20,
            language: None,
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

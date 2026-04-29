# Feature Backlog

Features under consideration for future implementation, not yet scheduled.

---

## Organization

### Snippet Folders / Groups *(Tier 1)*
Group snippets by category (work, dev, personal). Paste's "boards" model is its most-praised feature. Natural next step once snippet reordering is solid.
- **Comparable apps:** Paste, ClipboardFusion

### Tags / Labels on Entries and Snippets *(Tier 2)*
Cross-cutting classification (e.g., "client:acme") complementing folders. Allows tagging clipboard history entries as well as saved snippets.
- **Comparable apps:** CopyQ, ClipboardFusion

---

## Automation & Power Features

### Multi-Paste Queue (Clipboard Stack) *(Tier 1)*
Copy N items in sequence, then paste them in order. Power-user workflow; unique differentiator. Users copy multiple things and paste them sequentially without re-copying.
- **Comparable apps:** CopyQ, ClipboardFusion

### Regex Find/Replace Transform *(Tier 2)*
Custom regex as a text transformation option in the transform picker. Most-requested CopyQ developer feature — "transform before paste" with a user-supplied pattern.
- **Comparable apps:** CopyQ, ClipboardFusion

---

## Privacy & Security

### Auto-Delete Sensitive Patterns *(Tier 2)*
Regex rules to purge credit card numbers, API keys, passwords, etc. immediately on capture. Privacy-conscious users request this heavily.
- **Comparable apps:** ClipboardFusion

### Encrypted Storage *(Tier 3)*
Encrypt the SQLite history on disk. Requested following clipboard-sniffing incidents; Ditto stores plaintext — a known weakness.
- **Comparable apps:** ClipboardFusion

### App Lock / PIN *(Tier 3)*
Require a PIN or password to open Yank. Useful on shared or work machines.
- **Comparable apps:** ClipboardFusion, Paste

---

## UX & Interface

### Filter by Type in Search *(Tier 1)*
Toggle to show only text or only image entries in the history list. Essential for users with image-heavy histories.
- **Comparable apps:** CopyQ, ClipboardFusion, Paste

### Rich Text / HTML Rendering in History *(Tier 2)*
Render formatted content (HTML, Markdown) in the clipboard list instead of showing raw markup.
- **Comparable apps:** Paste, ClipboardFusion

---

## Sync

### Cross-Device Sync (LAN / Local) *(Tier 3)*
Sync clipboard history between machines over a local network without cloud dependency. The #1 reason users leave Ditto/CopyQ.
- **Comparable apps:** ClipboardFusion

---

*Features 1 (Pause Capture), 3 (More Text Transforms), 4 (Snippet Folders), and 8 (Regex Search) were selected for active development and have their own design specs in `docs/superpowers/specs/`.*

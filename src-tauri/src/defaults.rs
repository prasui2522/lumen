//! Style and layout defaults for PageDocument schema v1.1.
//! Optional `styleBreakpoints` is the v1.2 field: omitted unless a breakpoint has a key.
//! Version 3 is a save-time marker when the document contains an input or a switch.
//! Keep in sync with `src/schema.ts` (DEFAULT_STYLES, HEADING_FONT_SIZE, …).
//!
//! Serde: use `rename_all = "camelCase"` on structs that round-trip JSON
//! written by the TypeScript canvas.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub type NodeId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPage {
    pub id: String,
    pub name: String,
    pub path: String,
    pub root: NodeId,
    pub nodes: HashMap<NodeId, Node>,
}

/// On disk: single-page `{version,meta,root,nodes}` (v1–4) or multi-page
/// `{version:5,meta,pages}` (no top-level root/nodes). In memory after load,
/// `pages` is always populated (length >= 1) and `root`/`nodes` mirror a page
/// (home when loaded from v5 without an open-page hint).
#[derive(Debug, Clone)]
pub struct PageDocument {
    pub version: u32,
    pub meta: PageMeta,
    pub root: NodeId,
    pub nodes: HashMap<NodeId, Node>,
    pub pages: Vec<ProjectPage>,
}

impl Serialize for PageDocument {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        if self.pages.len() >= 2 || self.version == 5 {
            let mut map = serializer.serialize_map(Some(3))?;
            map.serialize_entry("version", &5u32)?;
            map.serialize_entry("meta", &self.meta)?;
            map.serialize_entry("pages", &self.pages)?;
            map.end()
        } else {
            let root = self.pages.first().map(|p| &p.root).unwrap_or(&self.root);
            let nodes = self.pages.first().map(|p| &p.nodes).unwrap_or(&self.nodes);
            let version = if self.version == 5 { 1 } else { self.version };
            let mut map = serializer.serialize_map(Some(4))?;
            map.serialize_entry("version", &version)?;
            map.serialize_entry("meta", &self.meta)?;
            map.serialize_entry("root", root)?;
            map.serialize_entry("nodes", nodes)?;
            map.end()
        }
    }
}

impl<'de> Deserialize<'de> for PageDocument {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let v = serde_json::Value::deserialize(deserializer)?;
        let obj = v.as_object().ok_or_else(|| serde::de::Error::custom("document must be an object"))?;
        let version = obj.get("version").and_then(|x| x.as_u64()).unwrap_or(1) as u32;
        let meta: PageMeta = serde_json::from_value(obj.get("meta").cloned().unwrap_or(serde_json::json!({"title":""})))
            .map_err(serde::de::Error::custom)?;
        if let Some(pages_v) = obj.get("pages") {
            let pages: Vec<ProjectPage> = serde_json::from_value(pages_v.clone()).map_err(serde::de::Error::custom)?;
            if pages.is_empty() {
                return Err(serde::de::Error::custom("pages must not be empty"));
            }
            let home = &pages[0];
            let (root, nodes) = if let (Some(r), Some(n)) = (obj.get("root"), obj.get("nodes")) {
                let root: NodeId = serde_json::from_value(r.clone()).map_err(serde::de::Error::custom)?;
                let nodes: HashMap<NodeId, Node> = serde_json::from_value(n.clone()).map_err(serde::de::Error::custom)?;
                (root, nodes)
            } else {
                (home.root.clone(), home.nodes.clone())
            };
            return Ok(PageDocument { version, meta, root, nodes, pages });
        }
        let root: NodeId = serde_json::from_value(obj.get("root").cloned().ok_or_else(|| serde::de::Error::custom("missing root"))?)
            .map_err(serde::de::Error::custom)?;
        let nodes: HashMap<NodeId, Node> = serde_json::from_value(obj.get("nodes").cloned().ok_or_else(|| serde::de::Error::custom("missing nodes"))?)
            .map_err(serde::de::Error::custom)?;
        let pages = vec![ProjectPage {
            id: "home".into(),
            name: "หน้าแรก".into(),
            path: "/".into(),
            root: root.clone(),
            nodes: nodes.clone(),
        }];
        Ok(PageDocument { version, meta, root, nodes, pages })
    }
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageMeta {
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lang: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub favicon: Option<AssetRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetRef {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alt: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeType {
    Page,
    Section,
    Container,
    Heading,
    Text,
    Image,
    Button,
    Link,
    Spacer,
    Input,
    Switch,
    Textarea,
    Kbd,
    Avatar,
    Progress,
    Slider,
    Empty,
    Item,
    Marker,
    Bubble,
    Message,
    Select,
    Radio,
    Toggle,
    #[serde(rename = "toggleGroup")]
    ToggleGroup,
    Tabs,
    #[serde(rename = "inputGroup")]
    InputGroup,
    #[serde(rename = "inputOtp")]
    InputOtp,
    Accordion,
    Collapsible,
    Breadcrumb,
    Pagination,
    #[serde(rename = "navigationMenu")]
    NavigationMenu,
    Menubar,
    #[serde(rename = "dropdownMenu")]
    DropdownMenu,
    Dialog,
    #[serde(rename = "alertDialog")]
    AlertDialog,
    Sheet,
    Drawer,
    Popover,
    Tooltip,
    #[serde(rename = "hoverCard")]
    HoverCard,
    // Phase 11 A2.1: nine kinds, appended so existing discriminants never move.
    Card,
    Alert,
    Badge,
    Separator,
    Skeleton,
    Spinner,
    #[serde(rename = "aspectRatio")]
    AspectRatio,
    #[serde(rename = "scrollArea")]
    ScrollArea,
    #[serde(rename = "buttonGroup")]
    ButtonGroup,
    // Phase 11 A3.1, appended so existing discriminants never move.
    Checkbox,
    // Phase 11 A3.3, appended so existing discriminants never move.
    Field,
    // Phase 11 A4.1, appended so existing discriminants never move.
    List,
    // Phase 11 A4.2, appended so existing discriminants never move.
    Table,
    // Phase 11 A4.5, appended so existing discriminants never move.
    Icon,
    // Phase 11 A5.1, appended so existing discriminants never move.
    Carousel,
    // Phase 11 A5.3, appended so existing discriminants never move.
    Chart,
    // Phase 11 A5.5, appended so existing discriminants never move.
    Calendar,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: NodeId,
    #[serde(rename = "type")]
    pub node_type: NodeType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// undefined / None = visible
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<bool>,
    /// undefined / None = not locked
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locked: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub class_names: Option<Vec<String>>,
    pub props: NodeProps,
    #[serde(default)]
    pub style: StyleProps,
    /// Sparse per-breakpoint style overrides. Absent when no breakpoint has a key.
    #[serde(default, skip_serializing_if = "skip_empty_breakpoints")]
    pub style_breakpoints: Option<StyleBreakpoints>,
}

/// Children only on page / section / container — leaf variants have none.
///
/// `rename_all` on an enum renames the *variants* (the `type` tag) only, not
/// the fields inside them, so multi-word fields carry an explicit camelCase
/// rename to match `src/schema.ts` (`objectFit`, `openInNewTab`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabelText {
    pub label: String,
    pub text: String,
}

/// Linkable label. Deserializes from `{label,href}` **or** a bare string
/// (legacy pagination / dropdownMenu item lists → href "").
#[derive(Debug, Clone, Serialize)]
pub struct LabelHref {
    pub label: String,
    pub href: String,
}

impl<'de> Deserialize<'de> for LabelHref {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Raw {
            Text(String),
            Pair {
                label: String,
                #[serde(default)]
                href: String,
            },
        }
        Ok(match Raw::deserialize(deserializer)? {
            Raw::Text(label) => LabelHref {
                label,
                href: String::new(),
            },
            Raw::Pair { label, href } => LabelHref { label, href },
        })
    }
}

/// shadcn-shaped menubar menu: trigger `label` + linkable `items`.
/// Legacy `{ label, text }` (Phase 6b flat pair) deserializes to one inert item.
#[derive(Debug, Clone, Serialize)]
pub struct MenubarMenu {
    pub label: String,
    pub items: Vec<LabelHref>,
}

impl<'de> Deserialize<'de> for MenubarMenu {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Raw {
            label: String,
            #[serde(default)]
            items: Option<Vec<LabelHref>>,
            #[serde(default)]
            text: Option<String>,
        }
        let raw = Raw::deserialize(deserializer)?;
        let items = if let Some(items) = raw.items {
            items
        } else if let Some(text) = raw.text {
            if text.trim().is_empty() {
                Vec::new()
            } else {
                vec![LabelHref {
                    label: text,
                    href: String::new(),
                }]
            }
        } else {
            Vec::new()
        };
        Ok(MenubarMenu {
            label: raw.label,
            items,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeAlign {
    Start,
    End,
}

/// Overlay edge — sheet + drawer (shadcn: top | right | bottom | left).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SheetSide {
    Top,
    Right,
    Bottom,
    Left,
}

fn drawer_side_default() -> SheetSide {
    SheetSide::Bottom
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum NodeProps {
    Page {
        children: Vec<NodeId>,
    },
    Section {
        children: Vec<NodeId>,
    },
    Container {
        children: Vec<NodeId>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        direction: Option<Direction>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        gap: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        align: Option<Align>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        justify: Option<Justify>,
    },
    Heading {
        level: u8,
        content: String,
    },
    Text {
        content: String,
    },
    Image {
        src: AssetRef,
        #[serde(rename = "objectFit", default, skip_serializing_if = "Option::is_none")]
        object_fit: Option<ObjectFit>,
    },
    Button {
        label: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        href: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        action: Option<ButtonAction>,
    },
    Link {
        label: String,
        href: String,
        #[serde(rename = "openInNewTab", default, skip_serializing_if = "Option::is_none")]
        open_in_new_tab: Option<bool>,
    },
    Spacer {
        size: u32,
    },
    Input {
        label: String,
        placeholder: String,
        /// Phase 11 A3.5: native `<datalist>` options. Empty / absent → no datalist.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        suggestions: Vec<String>,
    },
    Switch {
        label: String,
        checked: bool,
    },
    Textarea { label: String, placeholder: String },
    Kbd { text: String },
    Avatar { src: AssetRef, fallback: String },
    Progress { value: u32 },
    Slider {
        value: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        min: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        max: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        step: Option<u32>,
    },
    Empty {
        title: String,
        message: String,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "actionLabel")]
        action_label: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "actionHref")]
        action_href: Option<String>,
    },
    Item { title: String, description: String },
    Marker { text: String },
    Bubble { text: String, align: EdgeAlign },
    Message { sender: String, text: String, align: EdgeAlign },
    Select { value: String, options: Vec<String> },
    Radio { value: String, options: Vec<String> },
    Toggle { label: String, pressed: bool },
    ToggleGroup { active: u32, items: Vec<String> },
    Tabs { active: u32, items: Vec<LabelText> },
    InputGroup { prefix: String, placeholder: String, suffix: String },
    InputOtp { length: u32, value: String },
    Accordion { open: u32, items: Vec<LabelText> },
    Collapsible { label: String, text: String, open: bool },
    Breadcrumb { items: Vec<LabelHref> },
    Pagination { active: u32, items: Vec<LabelHref> },
    NavigationMenu { items: Vec<LabelHref> },
    Menubar { items: Vec<MenubarMenu> },
    DropdownMenu { label: String, items: Vec<LabelHref> },
    Dialog { title: String, message: String, open: bool },
    AlertDialog {
        title: String,
        message: String,
        confirm: String,
        cancel: String,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "confirmHref")]
        confirm_href: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "cancelHref")]
        cancel_href: Option<String>,
    },
    Sheet { title: String, message: String, side: SheetSide, open: bool },
    Drawer {
        title: String,
        message: String,
        #[serde(default = "drawer_side_default")]
        side: SheetSide,
        open: bool,
    },
    Popover { label: String, text: String },
    Tooltip { label: String, tip: String },
    HoverCard { title: String, text: String },
    // Phase 11 A2.1. Children live only on the container-like kinds; the
    // variants carry the same optional layout props as `Container`.
    Card {
        children: Vec<NodeId>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        direction: Option<Direction>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        gap: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        align: Option<Align>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        justify: Option<Justify>,
    },
    Alert {
        children: Vec<NodeId>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        direction: Option<Direction>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        gap: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        align: Option<Align>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        justify: Option<Justify>,
    },
    Badge { label: String },
    Separator { orientation: LineOrientation },
    Skeleton {},
    Spinner { size: u32 },
    AspectRatio {
        children: Vec<NodeId>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        direction: Option<Direction>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        gap: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        align: Option<Align>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        justify: Option<Justify>,
        ratio: AspectRatioValue,
    },
    ScrollArea {
        children: Vec<NodeId>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        direction: Option<Direction>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        gap: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        align: Option<Align>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        justify: Option<Justify>,
        orientation: ScrollOrientation,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        label: Option<String>,
    },
    ButtonGroup {
        children: Vec<NodeId>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        direction: Option<Direction>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        gap: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        align: Option<Align>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        justify: Option<Justify>,
    },
    /// Phase 11 A3.1. Both props always stored (like `Switch`), `checked` including false.
    Checkbox {
        label: String,
        checked: bool,
    },
    /// Phase 11 A3.3. A labelled form row (not a `<form>`). `label` always stored (may be "");
    /// `description` / `error` omitted when empty. Children hold the control (any kind).
    Field {
        children: Vec<NodeId>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        direction: Option<Direction>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        gap: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        align: Option<Align>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        justify: Option<Justify>,
        label: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        description: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    /// Phase 11 A4.1. Leaf list; items always stored (may be empty). Cap 50 at export.
    List {
        items: Vec<String>,
        ordered: bool,
        marker: ListMarker,
    },
    /// Phase 11 A4.2. Leaf table; caps 20 cols × 100 rows at export.
    Table {
        columns: Vec<String>,
        rows: Vec<Vec<String>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        caption: Option<String>,
        #[serde(rename = "headerRow", default = "table_header_row_default")]
        header_row: bool,
        #[serde(default)]
        striped: bool,
    },
    /// Phase 11 A5.1. Carousel: horizontal scroll-snap container. `slidesPerView` 1–4.
    Carousel {
        children: Vec<NodeId>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        direction: Option<Direction>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        gap: Option<u32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        align: Option<Align>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        justify: Option<Justify>,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "slidesPerView")]
        slides_per_view: Option<u32>,
    },
    /// Phase 11 A4.5. Leaf Lucide glyph; `name` is a curated icon-paths id.
    Icon {
        name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        label: Option<String>,
        size: u32,
        #[serde(rename = "strokeWidth")]
        stroke_width: f64,
    },
    /// Phase 11 A5.3. Leaf chart; ≤12 categories × ≤3 series; static SVG.
    Chart {
        kind: ChartKind,
        categories: Vec<String>,
        series: Vec<ChartSeries>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        caption: Option<String>,
    },
    /// Phase 11 A5.5. Leaf static month grid; `year` is in the selected era.
    Calendar {
        year: i32,
        month: u32,
        #[serde(default, skip_serializing_if = "Option::is_none", rename = "selectedDay")]
        selected_day: Option<u32>,
        #[serde(rename = "weekStart")]
        week_start: CalendarWeekStart,
        era: CalendarEra,
    },
}

/// Phase 11 A5.3 chart geometry kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ChartKind {
    Bar,
    Line,
    Area,
}

/// Phase 11 A5.3 one data series on a chart.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartSeries {
    pub name: String,
    /// Missing entries are JSON `null` and are skipped when drawing.
    pub values: Vec<Option<f64>>,
    pub color: String,
}

/// Phase 11 A5.5 calendar era (Buddhist / Common).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CalendarEra {
    Be,
    Ce,
}

/// Phase 11 A5.5 week start: 0 = Sunday, 1 = Monday (JSON number).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "u8", into = "u8")]
pub enum CalendarWeekStart {
    Sunday = 0,
    Monday = 1,
}

impl From<u8> for CalendarWeekStart {
    fn from(v: u8) -> Self {
        if v == 1 {
            CalendarWeekStart::Monday
        } else {
            CalendarWeekStart::Sunday
        }
    }
}

impl From<CalendarWeekStart> for u8 {
    fn from(v: CalendarWeekStart) -> Self {
        match v {
            CalendarWeekStart::Sunday => 0,
            CalendarWeekStart::Monday => 1,
        }
    }
}

fn table_header_row_default() -> bool {
    true
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ListMarker {
    Disc,
    Decimal,
    Check,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LineOrientation {
    Horizontal,
    Vertical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScrollOrientation {
    Vertical,
    Horizontal,
    Both,
}

/// Closed list: the value reaches CSS (`aspect-ratio`), so an unknown string
/// is rejected when the document is read rather than escaped later.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AspectRatioValue {
    #[serde(rename = "16/9")]
    R16x9,
    #[serde(rename = "4/3")]
    R4x3,
    #[serde(rename = "1/1")]
    R1x1,
    #[serde(rename = "3/2")]
    R3x2,
    #[serde(rename = "21/9")]
    R21x9,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Direction {
    Row,
    Column,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Align {
    Start,
    Center,
    End,
    Stretch,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Justify {
    Start,
    Center,
    End,
    Between,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObjectFit {
    Cover,
    Contain,
    Fill,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ButtonAction {
    Link,
    None,
}

/// B1.2 (§4.2): one `box-shadow` layer. All subfields optional; empty list ≡ unset.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoxShadowLayer {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blur: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spread: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inset: Option<bool>,
}

fn skip_empty_box_shadow(v: &Option<Vec<BoxShadowLayer>>) -> bool {
    v.as_ref().map_or(true, |layers| layers.is_empty())
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleProps {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<CssSize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<CssSize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_height: Option<CssSize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_width: Option<CssSize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub margin: Option<BoxSpacing>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub padding: Option<BoxSpacing>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<FontWeight>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_height: Option<CssSize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_align: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_radius: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_style: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub overflow: Option<String>,
    /// B1.2: layered box-shadow. Empty vec is treated as unset (see `skip_empty_box_shadow`).
    #[serde(default, skip_serializing_if = "skip_empty_box_shadow")]
    pub box_shadow: Option<Vec<BoxShadowLayer>>,
}

impl StyleProps {
    /// True when every key is unset. An empty object is not an override.
    pub fn is_empty(&self) -> bool {
        self.display.is_none()
            && self.width.is_none()
            && self.height.is_none()
            && self.min_height.is_none()
            && self.max_width.is_none()
            && self.margin.is_none()
            && self.padding.is_none()
            && self.background_color.is_none()
            && self.color.is_none()
            && self.font_family.is_none()
            && self.font_size.is_none()
            && self.font_weight.is_none()
            && self.line_height.is_none()
            && self.text_align.is_none()
            && self.border_radius.is_none()
            && self.border_width.is_none()
            && self.border_color.is_none()
            && self.border_style.is_none()
            && self.opacity.is_none()
            && self.overflow.is_none()
            && self.box_shadow.as_ref().map_or(true, |v| v.is_empty())
    }
}

/// Optional overrides for tablet / phone / fold-open. Same keys as `StyleProps` only.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleBreakpoints {
    #[serde(default, skip_serializing_if = "skip_empty_style")]
    pub tablet: Option<StyleProps>,
    #[serde(default, skip_serializing_if = "skip_empty_style")]
    pub phone: Option<StyleProps>,
    #[serde(default, skip_serializing_if = "skip_empty_style")]
    pub fold_open: Option<StyleProps>,
}

fn skip_empty_style(style: &Option<StyleProps>) -> bool {
    style.as_ref().map(StyleProps::is_empty).unwrap_or(true)
}

fn skip_empty_breakpoints(map: &Option<StyleBreakpoints>) -> bool {
    map.as_ref().map(StyleBreakpoints::is_empty).unwrap_or(true)
}

impl StyleBreakpoints {
    pub fn is_empty(&self) -> bool {
        skip_empty_style(&self.tablet) && skip_empty_style(&self.phone) && skip_empty_style(&self.fold_open)
    }

    fn drop_empty(&mut self) {
        if skip_empty_style(&self.tablet) {
            self.tablet = None;
        }
        if skip_empty_style(&self.phone) {
            self.phone = None;
        }
        if skip_empty_style(&self.fold_open) {
            self.fold_open = None;
        }
    }
}

/// Save rule: drop empty maps. Version 4 when a phase 6b kind (or a Phase 11 A2
/// kind, `is_version4_kind`) remains.
/// Otherwise version 3 when an input or a switch remains, version 2 when a
/// real breakpoint override remains, else 1. Opening does not call this.
fn normalize_page_nodes(nodes: &mut HashMap<NodeId, Node>) -> (bool, bool, bool) {
    let mut any = false;
    let mut field = false;
    let mut v4 = false;
    for node in nodes.values_mut() {
        if is_version4_kind(node.node_type) {
            v4 = true;
        } else if matches!(node.node_type, NodeType::Input | NodeType::Switch) {
            field = true;
        }
        let clear = if let Some(map) = node.style_breakpoints.as_mut() {
            map.drop_empty();
            map.is_empty()
        } else {
            false
        };
        if clear {
            node.style_breakpoints = None;
        } else if node.style_breakpoints.is_some() {
            any = true;
        }
    }
    (any, field, v4)
}

pub fn normalize_saved_document(doc: &mut PageDocument) {
    if doc.pages.is_empty() {
        doc.pages.push(ProjectPage {
            id: "home".into(),
            name: "หน้าแรก".into(),
            path: "/".into(),
            root: doc.root.clone(),
            nodes: doc.nodes.clone(),
        });
    }
    // Sync open tree into matching page when possible.
    if let Some(page) = doc.pages.iter_mut().find(|p| p.root == doc.root) {
        page.nodes = doc.nodes.clone();
    } else if let Some(home) = doc.pages.first_mut() {
        doc.root = home.root.clone();
        doc.nodes = home.nodes.clone();
    }
    let mut any = false;
    let mut field = false;
    let mut v4 = false;
    for page in &mut doc.pages {
        let (a, f, p6) = normalize_page_nodes(&mut page.nodes);
        any |= a;
        field |= f;
        v4 |= p6;
    }
    if doc.pages.len() >= 2 {
        doc.version = 5;
        // Keep root/nodes as home for in-memory readers that ignore pages.
        if let Some(home) = doc.pages.first() {
            doc.root = home.root.clone();
            doc.nodes = home.nodes.clone();
        }
        return;
    }
    // Collapse to one page under the 1–4 rule.
    if let Some(only) = doc.pages.first() {
        doc.root = only.root.clone();
        doc.nodes = only.nodes.clone();
    }
    doc.version = if v4 { 4 } else if field { 3 } else if any { 2 } else { 1 };
    doc.pages.clear();
}

fn is_phase6b(t: NodeType) -> bool {
    matches!(t, NodeType::Textarea | NodeType::Kbd | NodeType::Avatar | NodeType::Progress | NodeType::Slider | NodeType::Empty | NodeType::Item | NodeType::Marker | NodeType::Bubble | NodeType::Message | NodeType::Select | NodeType::Radio | NodeType::Toggle | NodeType::ToggleGroup | NodeType::Tabs | NodeType::InputGroup | NodeType::InputOtp | NodeType::Accordion | NodeType::Collapsible | NodeType::Breadcrumb | NodeType::Pagination | NodeType::NavigationMenu | NodeType::Menubar | NodeType::DropdownMenu | NodeType::Dialog | NodeType::AlertDialog | NodeType::Sheet | NodeType::Drawer | NodeType::Popover | NodeType::Tooltip | NodeType::HoverCard)
}

/// Phase 11 A2.1 kinds. Same marker as the phase 6b kinds (a single page that
/// holds one saves as version 4). A separate predicate so the UI routing that
/// keys off `is_phase6b` is untouched.
pub fn is_a2_kind(t: NodeType) -> bool {
    matches!(t, NodeType::Card | NodeType::Alert | NodeType::Badge | NodeType::Separator | NodeType::Skeleton | NodeType::Spinner | NodeType::AspectRatio | NodeType::ScrollArea | NodeType::ButtonGroup)
}

/// Phase 11 A3 kinds (A3.1 checkbox, A3.3 field). Same version-4 marker as the A2 kinds (spec §4.4).
pub fn is_a3_kind(t: NodeType) -> bool {
    matches!(t, NodeType::Checkbox | NodeType::Field)
}

/// Phase 11 A4 kinds (list / table / icon). Same version-4 marker as the A2/A3 kinds (spec §4.4).
pub fn is_a4_kind(t: NodeType) -> bool {
    matches!(t, NodeType::List | NodeType::Table | NodeType::Icon)
}

/// Phase 11 A5 kinds (carousel). Same version-4 marker as the A2/A3/A4 kinds (spec §4.4).
pub fn is_a5_kind(t: NodeType) -> bool {
    matches!(t, NodeType::Carousel | NodeType::Chart | NodeType::Calendar)
}

pub fn is_version4_kind(t: NodeType) -> bool {
    is_phase6b(t) || is_a2_kind(t) || is_a3_kind(t) || is_a4_kind(t) || is_a5_kind(t)
}

/// Number = px; string = raw CSS (e.g. "100%", "1rem").
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum CssSize {
    Px(f64),
    Raw(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum BoxSpacing {
    All(f64),
    Sides {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        t: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        r: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        b: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        l: Option<f64>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FontWeight {
    Number(u16),
    Keyword(String),
}

/// Default container props when fields are omitted.
pub struct ContainerPropDefaults;

impl ContainerPropDefaults {
    pub const DIRECTION: Direction = Direction::Column;
    pub const GAP: u32 = 0;
    pub const ALIGN: Align = Align::Stretch;
    pub const JUSTIFY: Justify = Justify::Start;
}

/// Phase 11 A2.2: effective layout of an A2 container kind whose props leave
/// direction / gap / align / justify unset (spec §9 A2 table). Mirrors
/// `A2_LAYOUT_DEFAULTS` in schema.ts. The compiler arms (A2.3 / A2.4) read it.
pub fn a2_layout_defaults(t: NodeType) -> Option<(Direction, u32, Align, Justify)> {
    match t {
        NodeType::Card => Some((Direction::Column, 16, Align::Stretch, Justify::Start)),
        NodeType::Alert => Some((Direction::Column, 8, Align::Stretch, Justify::Start)),
        NodeType::AspectRatio | NodeType::ScrollArea => Some((Direction::Column, 0, Align::Stretch, Justify::Start)),
        NodeType::ButtonGroup => Some((Direction::Row, 0, Align::Stretch, Justify::Start)),
        _ => None,
    }
}

/// Phase 11 A3.3: effective layout of a `field` whose props leave direction / gap / align /
/// justify unset (spec §9 A3: column, gap 6). Mirrors `A3_LAYOUT_DEFAULTS` in schema.ts.
pub fn a3_layout_defaults(t: NodeType) -> Option<(Direction, u32, Align, Justify)> {
    match t {
        NodeType::Field => Some((Direction::Column, 6, Align::Stretch, Justify::Start)),
        _ => None,
    }
}

/// Phase 11 A5.1: effective layout of a `carousel` whose props leave direction / gap / align /
/// justify unset (spec: row, gap 16, align stretch, justify start). Mirrors `A5_LAYOUT_DEFAULTS` in schema.ts.
pub fn a5_layout_defaults(t: NodeType) -> Option<(Direction, u32, Align, Justify)> {
    match t {
        NodeType::Carousel => Some((Direction::Row, 16, Align::Stretch, Justify::Start)),
        _ => None,
    }
}

pub const DEFAULT_IMAGE_OBJECT_FIT: ObjectFit = ObjectFit::Cover;

pub fn heading_font_size(level: u8) -> f64 {
    match level {
        1 => 40.0,
        2 => 32.0,
        3 => 28.0,
        4 => 24.0,
        5 => 20.0,
        6 => 18.0,
        _ => 16.0,
    }
}

pub fn default_styles(node_type: NodeType) -> StyleProps {
    match node_type {
        NodeType::Page => StyleProps {
            display: Some("block".into()),
            width: Some(CssSize::Raw("100%".into())),
            min_height: Some(CssSize::Raw("100%".into())),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            background_color: Some("#ffffff".into()),
            color: Some("#0f172a".into()),
            font_family: Some(
                "ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif"
                    .into(),
            ),
            font_size: Some(16.0),
            line_height: Some(CssSize::Raw("1.5".into())),
            ..StyleProps::default()
        },
        NodeType::Section => StyleProps {
            display: Some("block".into()),
            width: Some(CssSize::Raw("100%".into())),
            padding: Some(BoxSpacing::Sides {
                t: Some(32.0),
                r: Some(24.0),
                b: Some(32.0),
                l: Some(24.0),
            }),
            background_color: Some("transparent".into()),
            ..StyleProps::default()
        },
        NodeType::Container => StyleProps {
            display: Some("flex".into()),
            width: Some(CssSize::Raw("100%".into())),
            ..StyleProps::default()
        },
        NodeType::Heading => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::Sides {
                t: Some(0.0),
                r: Some(0.0),
                b: Some(8.0),
                l: Some(0.0),
            }),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_weight: Some(FontWeight::Number(700)),
            line_height: Some(CssSize::Raw("1.25".into())),
            text_align: Some("left".into()),
            ..StyleProps::default()
        },
        NodeType::Text => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::Sides {
                t: Some(0.0),
                r: Some(0.0),
                b: Some(8.0),
                l: Some(0.0),
            }),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#334155".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            line_height: Some(CssSize::Raw("1.6".into())),
            text_align: Some("left".into()),
            ..StyleProps::default()
        },
        NodeType::Image => StyleProps {
            display: Some("block".into()),
            width: Some(CssSize::Raw("100%".into())),
            max_width: Some(CssSize::Raw("100%".into())),
            height: Some(CssSize::Raw("auto".into())),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            border_radius: Some(0.0),
            overflow: Some("hidden".into()),
            ..StyleProps::default()
        },
        NodeType::Button => StyleProps {
            display: Some("inline-block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::Sides {
                t: Some(10.0),
                r: Some(16.0),
                b: Some(10.0),
                l: Some(16.0),
            }),
            background_color: Some("#0ea5e9".into()),
            color: Some("#ffffff".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(600)),
            line_height: Some(CssSize::Raw("1.25".into())),
            text_align: Some("center".into()),
            border_radius: Some(8.0),
            border_width: Some(0.0),
            border_style: Some("none".into()),
            ..StyleProps::default()
        },
        NodeType::Link => StyleProps {
            display: Some("inline".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0284c7".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(500)),
            text_align: Some("left".into()),
            ..StyleProps::default()
        },
        NodeType::Spacer => StyleProps {
            display: Some("block".into()),
            width: Some(CssSize::Raw("100%".into())),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            ..StyleProps::default()
        },
        NodeType::Input => StyleProps {
            display: Some("block".into()),
            width: Some(CssSize::Raw("100%".into())),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::Sides {
                t: Some(8.0),
                r: Some(12.0),
                b: Some(8.0),
                l: Some(12.0),
            }),
            background_color: Some("#ffffff".into()),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            line_height: Some(CssSize::Raw("1.5".into())),
            border_radius: Some(8.0),
            border_width: Some(1.0),
            border_color: Some("#e2e8f0".into()),
            border_style: Some("solid".into()),
            ..StyleProps::default()
        },
        NodeType::Switch => StyleProps {
            display: Some("flex".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Textarea => StyleProps {
            display: Some("block".into()),
            width: Some(CssSize::Raw("100%".into())),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::Sides { t: Some(8.0), r: Some(12.0), b: Some(8.0), l: Some(12.0) }),
            background_color: Some("#ffffff".into()),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            line_height: Some(CssSize::Raw("1.5".into())),
            border_radius: Some(8.0),
            border_width: Some(1.0),
            border_color: Some("#e2e8f0".into()),
            border_style: Some("solid".into()),
            ..StyleProps::default()
        },
        NodeType::Kbd => StyleProps {
            display: Some("inline-block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::Sides { t: Some(2.0), r: Some(6.0), b: Some(2.0), l: Some(6.0) }),
            color: Some("#0f172a".into()),
            font_size: Some(14.0),
            font_weight: Some(FontWeight::Number(400)),
            border_radius: Some(4.0),
            border_width: Some(1.0),
            border_color: Some("#e2e8f0".into()),
            border_style: Some("solid".into()),
            ..StyleProps::default()
        },
        NodeType::Avatar => StyleProps {
            display: Some("block".into()),
            width: Some(CssSize::Px(40.0)),
            height: Some(CssSize::Px(40.0)),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            background_color: Some("#e2e8f0".into()),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            text_align: Some("center".into()),
            border_radius: Some(999.0),
            overflow: Some("hidden".into()),
            ..StyleProps::default()
        },
        NodeType::Progress => StyleProps {
            display: Some("block".into()),
            width: Some(CssSize::Raw("100%".into())),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            ..StyleProps::default()
        },
        NodeType::Slider => StyleProps {
            display: Some("block".into()),
            width: Some(CssSize::Raw("100%".into())),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            ..StyleProps::default()
        },
        NodeType::Empty => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Item => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Marker => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Bubble => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Message => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Select => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Radio => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Toggle => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::ToggleGroup => StyleProps {
            display: Some("flex".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Tabs => StyleProps {
            display: Some("flex".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::InputGroup => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::InputOtp => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Accordion => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Collapsible => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Breadcrumb => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Pagination => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::NavigationMenu => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Menubar => StyleProps {
            display: Some("flex".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::DropdownMenu => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Dialog => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::AlertDialog => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Sheet => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Drawer => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Popover => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::Tooltip => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        NodeType::HoverCard => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        // Phase 11 A2.1 defaults: existing 20 keys, literal hex (spec section 4.1).
        // Layout props (direction/gap/align/justify) are props, not style.
        // Designer ruling (A2.3 part 2): badge is `inline-flex`, scrollArea `overflow:auto`
        // (existing keys; the TS unions grew). Mirrors DEFAULT_STYLES in schema.ts.
        NodeType::Card => StyleProps {
            display: Some("flex".into()),
            width: Some(CssSize::Raw("100%".into())),
            padding: Some(BoxSpacing::All(24.0)),
            background_color: Some("#ffffff".into()),
            border_radius: Some(12.0),
            border_width: Some(1.0),
            border_color: Some("#e2e8f0".into()),
            border_style: Some("solid".into()),
            ..StyleProps::default()
        },
        NodeType::Alert => StyleProps {
            display: Some("flex".into()),
            width: Some(CssSize::Raw("100%".into())),
            padding: Some(BoxSpacing::All(16.0)),
            background_color: Some("#f8fafc".into()),
            border_radius: Some(8.0),
            border_width: Some(1.0),
            border_color: Some("#e2e8f0".into()),
            border_style: Some("solid".into()),
            ..StyleProps::default()
        },
        NodeType::Badge => StyleProps {
            display: Some("inline-flex".into()),
            padding: Some(BoxSpacing::Sides { t: Some(2.0), r: Some(10.0), b: Some(2.0), l: Some(10.0) }),
            background_color: Some("#0f172a".into()),
            color: Some("#ffffff".into()),
            font_size: Some(12.0),
            font_weight: Some(FontWeight::Number(500)),
            border_radius: Some(200.0),
            ..StyleProps::default()
        },
        NodeType::Separator => StyleProps {
            display: Some("block".into()),
            width: Some(CssSize::Raw("100%".into())),
            height: Some(CssSize::Px(1.0)),
            background_color: Some("#e2e8f0".into()),
            ..StyleProps::default()
        },
        NodeType::Skeleton => StyleProps {
            display: Some("block".into()),
            width: Some(CssSize::Raw("100%".into())),
            height: Some(CssSize::Px(16.0)),
            background_color: Some("#e2e8f0".into()),
            border_radius: Some(6.0),
            ..StyleProps::default()
        },
        NodeType::Spinner => StyleProps {
            display: Some("inline-block".into()),
            color: Some("#0f172a".into()),
            ..StyleProps::default()
        },
        NodeType::AspectRatio => StyleProps {
            display: Some("flex".into()),
            width: Some(CssSize::Raw("100%".into())),
            overflow: Some("hidden".into()),
            ..StyleProps::default()
        },
        NodeType::ScrollArea => StyleProps {
            display: Some("flex".into()),
            width: Some(CssSize::Raw("100%".into())),
            overflow: Some("auto".into()),
            ..StyleProps::default()
        },
        NodeType::ButtonGroup => StyleProps {
            display: Some("flex".into()),
            ..StyleProps::default()
        },
        // Phase 11 A3.1: the label row (like switch). The 16px box is a compiler constant
        // (kind-looks.json `a3.kinds.checkbox`), never a style key.
        NodeType::Checkbox => StyleProps {
            display: Some("flex".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            ..StyleProps::default()
        },
        // Phase 11 A3.3: flex column; gap 6 is a layout prop default, not a style key.
        // Label / description / error colours are kind-looks `a3.kinds.field` constants.
        NodeType::Field => StyleProps {
            display: Some("flex".into()),
            ..StyleProps::default()
        },
        // Phase 11 A4.1: list body text. Marker CSS is kind-looks `a4.kinds.list`.
        NodeType::List => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            line_height: Some(CssSize::Raw("1.5".into())),
            ..StyleProps::default()
        },
        // Phase 11 A4.2: table body text. Grid CSS is kind-looks `a4.kinds.table`.
        NodeType::Table => StyleProps {
            display: Some("block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(16.0),
            font_weight: Some(FontWeight::Number(400)),
            line_height: Some(CssSize::Raw("1.5".into())),
            ..StyleProps::default()
        },
        // Phase 11 A5.1: carousel (flex row, scroll-snap). Layout props are props, not style.
        NodeType::Carousel => StyleProps {
            display: Some("flex".into()),
            width: Some(CssSize::Raw("100%".into())),
            ..StyleProps::default()
        },
        // Phase 11 A4.5: icon colour via currentColor; size/stroke are props.
        NodeType::Icon => StyleProps {
            display: Some("inline-block".into()),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            ..StyleProps::default()
        },
        // Phase 11 A5.3: chart fills width; SVG viewBox is 600×300.
        NodeType::Chart => StyleProps {
            display: Some("block".into()),
            width: Some(CssSize::Raw("100%".into())),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            ..StyleProps::default()
        },
        // Phase 11 A5.5: calendar month grid.
        NodeType::Calendar => StyleProps {
            display: Some("block".into()),
            width: Some(CssSize::Raw("100%".into())),
            margin: Some(BoxSpacing::All(0.0)),
            padding: Some(BoxSpacing::All(0.0)),
            color: Some("#0f172a".into()),
            font_size: Some(14.0),
            ..StyleProps::default()
        },
    }
}

/// Merge type defaults under `node.style`. Heading level sets default fontSize.
/// Spacer height still comes from `NodeProps::Spacer { size }` at render time.
pub fn resolved_style(node: &Node) -> StyleProps {
    let mut base = default_styles(node.node_type);

    if let NodeProps::Heading { level, .. } = &node.props {
        base.font_size = Some(heading_font_size(*level));
    }

    overlay_style(&mut base, &node.style);
    base
}

fn overlay_style(base: &mut StyleProps, over: &StyleProps) {
    if over.display.is_some() {
        base.display = over.display.clone();
    }
    if over.width.is_some() {
        base.width = over.width.clone();
    }
    if over.height.is_some() {
        base.height = over.height.clone();
    }
    if over.min_height.is_some() {
        base.min_height = over.min_height.clone();
    }
    if over.max_width.is_some() {
        base.max_width = over.max_width.clone();
    }
    if over.margin.is_some() {
        base.margin = over.margin.clone();
    }
    if over.padding.is_some() {
        base.padding = over.padding.clone();
    }
    if over.background_color.is_some() {
        base.background_color = over.background_color.clone();
    }
    if over.color.is_some() {
        base.color = over.color.clone();
    }
    if over.font_family.is_some() {
        base.font_family = over.font_family.clone();
    }
    if over.font_size.is_some() {
        base.font_size = over.font_size;
    }
    if over.font_weight.is_some() {
        base.font_weight = over.font_weight.clone();
    }
    if over.line_height.is_some() {
        base.line_height = over.line_height.clone();
    }
    if over.text_align.is_some() {
        base.text_align = over.text_align.clone();
    }
    if over.border_radius.is_some() {
        base.border_radius = over.border_radius;
    }
    if over.border_width.is_some() {
        base.border_width = over.border_width;
    }
    if over.border_color.is_some() {
        base.border_color = over.border_color.clone();
    }
    if over.border_style.is_some() {
        base.border_style = over.border_style.clone();
    }
    if over.opacity.is_some() {
        base.opacity = over.opacity;
    }
    if over.overflow.is_some() {
        base.overflow = over.overflow.clone();
    }
    if over.box_shadow.is_some() {
        base.box_shadow = over.box_shadow.clone();
    }
}

impl Node {
    pub fn is_visible(&self) -> bool {
        self.visible != Some(false)
    }

    pub fn is_locked(&self) -> bool {
        self.locked == Some(true)
    }

    pub fn children(&self) -> &[NodeId] {
        match &self.props {
            NodeProps::Page { children }
            | NodeProps::Section { children }
            | NodeProps::Container { children, .. }
            // Phase 11 A2.2: the A2 kinds with children (mirrors CONTAINER_NODE_TYPES in schema.ts).
            | NodeProps::Card { children, .. }
            | NodeProps::Alert { children, .. }
            | NodeProps::AspectRatio { children, .. }
            | NodeProps::ScrollArea { children, .. }
            | NodeProps::ButtonGroup { children, .. }
            | NodeProps::Field { children, .. }
            | NodeProps::Carousel { children, .. } => children.as_slice(),
            _ => &[],
        }
    }
}

//! Style and layout defaults for PageDocument schema v1.1.
//! Keep in sync with `src/schema.ts` (DEFAULT_STYLES, HEADING_FONT_SIZE, …).
//!
//! Serde: use `rename_all = "camelCase"` on structs that round-trip JSON
//! written by the TypeScript canvas.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub type NodeId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageDocument {
    pub version: u32,
    pub meta: PageMeta,
    pub root: NodeId,
    pub nodes: HashMap<NodeId, Node>,
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
}

/// Children only on page / section / container — leaf variants have none.
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
        #[serde(default, skip_serializing_if = "Option::is_none")]
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
        #[serde(default, skip_serializing_if = "Option::is_none")]
        open_in_new_tab: Option<bool>,
    },
    Spacer {
        size: u32,
    },
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
            | NodeProps::Container { children, .. } => children.as_slice(),
            _ => &[],
        }
    }
}

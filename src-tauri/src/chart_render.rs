//! Phase 11 A5.3 — static chart SVG renderer.
//! Algorithm mirrors `src/lib/chart-render.ts` so golden SVG fixtures match.

use crate::defaults::ChartKind;

pub const CHART_MAX_CATEGORIES: usize = 12;
pub const CHART_MAX_SERIES: usize = 3;
pub const CHART_VB_W: i32 = 600;
pub const CHART_VB_H: i32 = 300;
pub const CHART_DEFAULT_COLORS: [&str; 3] = ["#2563eb", "#16a34a", "#ea580c"];

const PAD_L: i32 = 48;
const PAD_R: i32 = 16;
const PAD_T: i32 = 24;
const PAD_B: i32 = 40;

#[derive(Debug, Clone)]
pub struct ChartSeriesIn {
    pub name: String,
    pub values: Vec<Option<f64>>,
    pub color: String,
}

#[derive(Debug, Clone)]
pub struct ChartModelIn {
    pub kind: ChartKind,
    pub categories: Vec<String>,
    pub series: Vec<ChartSeriesIn>,
    pub caption: Option<String>,
}

struct NormSeries {
    name: String,
    values: Vec<Option<f64>>,
    color: String,
}

struct Norm {
    kind: ChartKind,
    categories: Vec<String>,
    series: Vec<NormSeries>,
    caption: String,
}

fn xml_esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn sanitize_color(raw: &str, fallback: &str) -> String {
    let t = raw.trim();
    let ok = t.starts_with('#')
        && matches!(t.len(), 4 | 7 | 9)
        && t.bytes().skip(1).all(|b| b.is_ascii_hexdigit());
    if ok {
        t.to_ascii_lowercase()
    } else {
        fallback.to_string()
    }
}

fn fmt_val(n: f64) -> String {
    let r = (n * 100.0).round() / 100.0;
    if (r - r.round()).abs() < 1e-9 {
        format!("{}", r.round() as i64)
    } else {
        let s = format!("{:.2}", r);
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

fn px(n: f64) -> i32 {
    n.round() as i32
}

fn finite_at(values: &[Option<f64>], i: usize) -> Option<f64> {
    values.get(i).and_then(|v| *v).filter(|x| x.is_finite())
}

fn normalize(model: &ChartModelIn) -> Norm {
    let kind = model.kind;
    let categories: Vec<String> = model
        .categories
        .iter()
        .take(CHART_MAX_CATEGORIES)
        .cloned()
        .collect();
    let n = categories.len();
    let series: Vec<NormSeries> = model
        .series
        .iter()
        .take(CHART_MAX_SERIES)
        .enumerate()
        .map(|(si, s)| {
            let fallback = CHART_DEFAULT_COLORS[si % CHART_DEFAULT_COLORS.len()];
            let mut values = Vec::with_capacity(n);
            for i in 0..n {
                values.push(finite_at(&s.values, i));
            }
            let name = if s.name.is_empty() {
                format!("Series {}", si + 1)
            } else {
                s.name.clone()
            };
            NormSeries {
                name,
                values,
                color: sanitize_color(&s.color, fallback),
            }
        })
        .collect();
    let caption = model
        .caption
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Chart")
        .to_string();
    Norm {
        kind,
        categories,
        series,
        caption,
    }
}

fn max_value(series: &[NormSeries]) -> f64 {
    let mut m = 0.0_f64;
    for s in series {
        for v in &s.values {
            if let Some(x) = v {
                if *x > m {
                    m = *x;
                }
            }
        }
    }
    if m > 0.0 {
        m
    } else {
        1.0
    }
}

fn build_desc(norm: &Norm) -> String {
    let mut parts: Vec<String> = Vec::new();
    for s in &norm.series {
        for (i, cat) in norm.categories.iter().enumerate() {
            let Some(v) = s.values[i] else { continue };
            let cat_label = if cat.is_empty() {
                format!("คอลัมน์ {}", i + 1)
            } else {
                cat.clone()
            };
            parts.push(format!("{} {}: {}", s.name, cat_label, fmt_val(v)));
        }
    }
    if parts.is_empty() {
        "ไม่มีข้อมูล".into()
    } else {
        format!("{}.", parts.join(". "))
    }
}

fn emit_baseline(out: &mut String, plot_w: i32, baseline: i32) {
    let x2 = PAD_L + plot_w;
    out.push_str(&format!(
        "<line x1=\"{PAD_L}\" y1=\"{baseline}\" x2=\"{x2}\" y2=\"{baseline}\" stroke=\"#cbd5e1\" stroke-width=\"1\"/>"
    ));
}

fn emit_bars(out: &mut String, norm: &Norm, plot_w: i32, plot_h: i32, max_v: f64) {
    let n = norm.categories.len().max(1) as f64;
    let s_count = norm.series.len().max(1) as f64;
    let group_w = plot_w as f64 / n;
    let inner_gap = 4.0_f64;
    let usable = (group_w - inner_gap).max(1.0);
    let bar_w = (usable / s_count).floor().max(1.0);
    let baseline = PAD_T + plot_h;

    for (si, s) in norm.series.iter().enumerate() {
        for (ci, _) in norm.categories.iter().enumerate() {
            let Some(v) = s.values[ci] else { continue };
            if v <= 0.0 {
                continue;
            }
            let h = (v / max_v) * plot_h as f64;
            let x = px(PAD_L as f64 + ci as f64 * group_w + inner_gap / 2.0 + si as f64 * bar_w);
            let y = px(baseline as f64 - h);
            let hh = px(h).max(1);
            out.push_str(&format!(
                "<rect x=\"{x}\" y=\"{y}\" width=\"{}\" height=\"{hh}\" fill=\"{}\"/>",
                px(bar_w),
                s.color
            ));
        }
    }
}

fn emit_line_or_area(
    out: &mut String,
    norm: &Norm,
    plot_w: i32,
    plot_h: i32,
    max_v: f64,
    area: bool,
) {
    let n = norm.categories.len().max(1) as f64;
    let group_w = plot_w as f64 / n;
    let baseline = PAD_T + plot_h;

    for s in &norm.series {
        #[derive(Clone, Copy)]
        struct Pt {
            x: i32,
            y: i32,
        }
        let mut pts: Vec<Option<Pt>> = Vec::with_capacity(norm.categories.len());
        for (ci, _) in norm.categories.iter().enumerate() {
            match s.values[ci] {
                None => pts.push(None),
                Some(v) => {
                    let x = px(PAD_L as f64 + (ci as f64 + 0.5) * group_w);
                    let y = px(baseline as f64 - (v / max_v) * plot_h as f64);
                    pts.push(Some(Pt { x, y }));
                }
            }
        }

        let mut run: Vec<Pt> = Vec::new();
        let flush_run = |out: &mut String, run: &mut Vec<Pt>, color: &str| {
            if run.is_empty() {
                return;
            }
            if area {
                let first = run[0];
                let last = run[run.len() - 1];
                let mut d = format!("M{} {}", first.x, baseline);
                for p in run.iter() {
                    d.push_str(&format!(" L{} {}", p.x, p.y));
                }
                d.push_str(&format!(" L{} {} Z", last.x, baseline));
                out.push_str(&format!(
                    "<path d=\"{d}\" fill=\"{color}\" fill-opacity=\"0.25\" stroke=\"none\"/>"
                ));
            }
            if run.len() == 1 {
                let p = run[0];
                out.push_str(&format!(
                    "<circle cx=\"{}\" cy=\"{}\" r=\"3\" fill=\"{color}\"/>",
                    p.x, p.y
                ));
            } else if run.len() >= 2 {
                let points: String = run
                    .iter()
                    .map(|p| format!("{},{}", p.x, p.y))
                    .collect::<Vec<_>>()
                    .join(" ");
                out.push_str(&format!(
                    "<polyline points=\"{points}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>"
                ));
            }
            run.clear();
        };

        for p in pts {
            match p {
                None => flush_run(out, &mut run, &s.color),
                Some(pt) => run.push(pt),
            }
        }
        flush_run(out, &mut run, &s.color);
    }
}

/// Deterministic SVG string matching `renderChartSvg` in TS.
pub fn render_chart_svg(model: &ChartModelIn) -> String {
    let norm = normalize(model);
    let plot_w = CHART_VB_W - PAD_L - PAD_R;
    let plot_h = CHART_VB_H - PAD_T - PAD_B;
    let max_v = max_value(&norm.series);
    let baseline = PAD_T + plot_h;

    let mut out = String::new();
    out.push_str(&format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {CHART_VB_W} {CHART_VB_H}\" width=\"100%\" role=\"img\">"
    ));
    out.push_str(&format!("<title>{}</title>", xml_esc(&norm.caption)));
    out.push_str(&format!("<desc>{}</desc>", xml_esc(&build_desc(&norm))));
    emit_baseline(&mut out, plot_w, baseline);

    match norm.kind {
        ChartKind::Bar => emit_bars(&mut out, &norm, plot_w, plot_h, max_v),
        ChartKind::Line => emit_line_or_area(&mut out, &norm, plot_w, plot_h, max_v, false),
        ChartKind::Area => emit_line_or_area(&mut out, &norm, plot_w, plot_h, max_v, true),
    }

    out.push_str("</svg>");
    out
}

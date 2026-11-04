//! Phase 11 A5.5 — static calendar month grid.
//! Algorithm + Thai names mirror `src/lib/calendar-render.ts`.

use crate::defaults::{CalendarEra, CalendarWeekStart};

pub const THAI_MONTHS: [&str; 13] = [
    "",
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
];

pub const THAI_WEEKDAYS_SUN: [&str; 7] = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

#[derive(Debug, Clone)]
pub struct CalendarModelIn {
    pub year: i32,
    pub month: u32,
    pub selected_day: Option<u32>,
    pub week_start: CalendarWeekStart,
    pub era: CalendarEra,
}

fn xml_esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub fn is_leap_year(ce_year: i32) -> bool {
    (ce_year % 4 == 0 && ce_year % 100 != 0) || ce_year % 400 == 0
}

pub fn days_in_month(ce_year: i32, month: u32) -> u32 {
    let m = month.clamp(1, 12);
    match m {
        2 => {
            if is_leap_year(ce_year) {
                29
            } else {
                28
            }
        }
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

pub fn to_ce_year(year: i32, era: CalendarEra) -> i32 {
    match era {
        CalendarEra::Be => year - 543,
        CalendarEra::Ce => year,
    }
}

/// Sakamoto: 0 = Sunday … 6 = Saturday.
pub fn weekday_sun0(ce_year: i32, month: u32, day: u32) -> u32 {
    let t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let m = month.clamp(1, 12);
    let d = day.clamp(1, 31);
    let mut y = ce_year;
    if m < 3 {
        y -= 1;
    }
    let idx = (m - 1) as usize;
    ((y + y / 4 - y / 100 + y / 400 + t[idx] + d as i32).rem_euclid(7)) as u32
}

pub fn render_calendar_html(model: &CalendarModelIn) -> String {
    let era = model.era;
    let week_start = model.week_start;
    let month = model.month.clamp(1, 12);
    let year = if model.year == 0 {
        match era {
            CalendarEra::Be => 2569,
            CalendarEra::Ce => 2026,
        }
    } else {
        model.year
    };
    let ce = to_ce_year(year, era);
    let dim = days_in_month(ce, month);
    let mut selected = model.selected_day;
    if let Some(d) = selected {
        if d < 1 || d > dim {
            selected = None;
        }
    }

    let month_name = THAI_MONTHS[month as usize];
    let caption = match era {
        CalendarEra::Be => format!("{month_name} {year}"),
        CalendarEra::Ce => format!("{month_name} ค.ศ. {year}"),
    };

    let first_dow = weekday_sun0(ce, month, 1);
    let lead = match week_start {
        CalendarWeekStart::Sunday => first_dow,
        CalendarWeekStart::Monday => (first_dow + 6) % 7,
    };

    let headers: Vec<&str> = match week_start {
        CalendarWeekStart::Sunday => THAI_WEEKDAYS_SUN.to_vec(),
        CalendarWeekStart::Monday => {
            let mut h = THAI_WEEKDAYS_SUN[1..].to_vec();
            h.push(THAI_WEEKDAYS_SUN[0]);
            h
        }
    };

    let mut out = String::new();
    out.push_str("<table class=\"t-calendar\">");
    out.push_str(&format!("<caption>{}</caption>", xml_esc(&caption)));
    out.push_str("<thead><tr>");
    for h in &headers {
        out.push_str(&format!("<th scope=\"col\">{h}</th>"));
    }
    out.push_str("</tr></thead><tbody>");

    let total_cells = ((lead + dim + 6) / 7) * 7;
    let mut day = 1u32;
    for i in 0..total_cells {
        if i % 7 == 0 {
            out.push_str("<tr>");
        }
        if i < lead || day > dim {
            out.push_str("<td></td>");
        } else {
            let cur = day;
            day += 1;
            if selected == Some(cur) {
                out.push_str(&format!(
                    "<td class=\"t-calendar__day t-calendar__day--selected\" aria-current=\"date\">{cur}</td>"
                ));
            } else {
                out.push_str(&format!("<td class=\"t-calendar__day\">{cur}</td>"));
            }
        }
        if i % 7 == 6 {
            out.push_str("</tr>");
        }
    }
    out.push_str("</tbody></table>");
    out
}

use super::layout::text_width;
use super::{
    add_insert_at_scale, add_line, add_polyline, add_text, hatch_path, CadDrawing,
    CadRegionDisplay, CadShape, PileSymbol, LEGEND,
};
use opencaddocument::entities::Hatch;
use opencaddocument::{Color, Document, EntityType, Error};
use std::collections::BTreeMap;

pub(super) fn draw(
    doc: &mut Document,
    drawing: &CadDrawing,
    symbols: &BTreeMap<(CadShape, Option<u32>), PileSymbol>,
    left: f64,
    top: f64,
    unit: f64,
) -> Result<(), Error> {
    let height = 3.2 * unit;
    let margin = 8. * unit;
    let mark_x = left + 23. * unit;
    let size_x = mark_x + (text_width(&drawing.legend.mark, height) + 5. * unit).max(17. * unit);
    let size_names = symbols
        .keys()
        .map(|(shape, size)| match (shape, size) {
            (CadShape::Round, Some(size)) => format!("Ø{size} mm"),
            (CadShape::Square, Some(size)) => format!("{size} × {size} mm"),
            _ => drawing.unassigned_label.clone(),
        })
        .collect::<Vec<_>>();
    let size_width = size_names
        .iter()
        .map(|name| text_width(name, height))
        .fold(text_width(&drawing.legend.size, height), f64::max);
    let count_x = size_x + (size_width + 7. * unit).max(61. * unit);
    let headings = wrap_title(&drawing.project)
        .into_iter()
        .chain(wrap_title(&drawing.plan))
        .collect::<Vec<_>>();
    let title_height = 6. * unit;
    let heading_height = 3.8 * unit;
    let regions = drawing.included_regions();
    let points_width = regions
        .iter()
        .map(|region| text_width(&region.label, height) + 36. * unit)
        .fold(0., f64::max);
    let count_width = symbols
        .values()
        .map(|symbol| text_width(&symbol.count.to_string(), height))
        .fold(text_width(&drawing.legend.count, height), f64::max);
    let mut width = (count_x - left + count_width + margin).max(147. * unit);
    for (text, size) in headings
        .iter()
        .map(|s| (s.as_str(), heading_height))
        .chain([
            (drawing.legend.title.as_str(), title_height),
            (drawing.piles_label.as_str(), heading_height),
            (drawing.regions_label.as_str(), heading_height),
            (drawing.legend.cpts.as_str(), height),
        ])
    {
        width = width.max(text_width(text, size) + 4. * margin);
    }
    let right = left + width.max(points_width);
    let mut y = top - 13. * unit;
    add_text(
        doc,
        &drawing.legend.title,
        [left + margin, y],
        title_height,
        LEGEND,
    )?;
    for heading in headings {
        y -= 8. * unit;
        add_text(doc, &heading, [left + margin, y], heading_height, LEGEND)?;
    }
    y -= 6. * unit;
    add_line(doc, [left, y], [right, y], LEGEND)?;
    y -= 9. * unit;
    add_text(
        doc,
        &drawing.piles_label,
        [left + margin, y],
        heading_height,
        LEGEND,
    )?;
    y -= 8. * unit;
    for (x, label) in [
        (mark_x, &drawing.legend.mark),
        (size_x, &drawing.legend.size),
        (count_x, &drawing.legend.count),
    ] {
        add_text(doc, label, [x, y], height, LEGEND)?;
    }
    y -= 3. * unit;
    add_line(doc, [left + margin, y], [right - margin, y], LEGEND)?;
    for (symbol, name) in symbols.values().zip(size_names) {
        y -= 9. * unit;
        add_insert_at_scale(
            doc,
            &symbol.block,
            [left + 13. * unit, y + 1.1 * unit],
            2.6 * unit / symbol.radius,
            LEGEND,
        )?;
        if let Some(mark) = symbol.mark {
            add_text(doc, &format!("P{mark}"), [mark_x, y], height, LEGEND)?;
        }
        add_text(doc, &name, [size_x, y], height, LEGEND)?;
        add_text(doc, &symbol.count.to_string(), [count_x, y], height, LEGEND)?;
        y -= 3. * unit;
        add_line(doc, [left + margin, y], [right - margin, y], LEGEND)?;
    }

    if !regions.is_empty() {
        y -= 12. * unit;
        add_text(
            doc,
            &drawing.regions_label,
            [left + margin, y],
            heading_height,
            LEGEND,
        )?;
        for (index, region) in regions
            .iter()
            .enumerate()
            .filter(|(_, region)| !region.areas.is_empty())
        {
            y -= 8.5 * unit;
            if matches!(drawing.options.region_display, CadRegionDisplay::Filled) {
                let x = left + margin;
                let swatch = [
                    [x, y],
                    [x + 10. * unit, y],
                    [x + 10. * unit, y + 4.4 * unit],
                    [x, y + 4.4 * unit],
                ];
                let mut fill = Hatch::solid();
                fill.common.layer = LEGEND.into();
                let [r, g, b] = region.color;
                fill.common.color = Color::from_rgb(r, g, b);
                fill.add_path(hatch_path(&swatch, true));
                doc.add_entity(EntityType::Hatch(Box::new(fill)))?;
                add_polyline(doc, &swatch, true, LEGEND, None)?;
            }
            add_text(doc, &format!("Z{}", index + 1), [mark_x, y], height, LEGEND)?;
            add_text(doc, &region.label, [size_x, y], height, LEGEND)?;
        }
    }
    if !drawing.included_cpts().is_empty() {
        y -= 7. * unit;
        add_line(doc, [left, y], [right, y], LEGEND)?;
        y -= 10. * unit;
        add_insert_at_scale(
            doc,
            "CPT",
            [left + 13. * unit, y + 1.2 * unit],
            2.6 * unit / 210.,
            LEGEND,
        )?;
        add_text(doc, &drawing.legend.cpts, [mark_x, y], height, LEGEND)?;
    }

    y -= 8. * unit;
    add_polyline(
        doc,
        &[[left, y], [right, y], [right, top], [left, top]],
        true,
        LEGEND,
        None,
    )?;
    Ok(())
}

fn wrap_title(value: &str) -> Vec<String> {
    let mut lines = Vec::new();
    let mut line = String::new();
    for word in value.split_whitespace() {
        if !line.is_empty() && line.chars().count() + word.chars().count() > 32 {
            lines.push(std::mem::take(&mut line));
        }
        if !line.is_empty() {
            line.push(' ');
        }
        line.push_str(word);
    }
    if !line.is_empty() {
        lines.push(line);
    }
    lines
}

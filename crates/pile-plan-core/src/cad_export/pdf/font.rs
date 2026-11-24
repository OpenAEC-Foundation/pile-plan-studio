use super::{compress, Point};
use opencaddocument::entities::{Text, TextHorizontalAlignment};
use opencaddocument::{BoundingBox3D, EntityType, Error, Vector3};
use pdf_writer::types::{CidFontType, FontFlags, SystemInfo, UnicodeCmap};
use pdf_writer::{Filter, Name, Pdf, Rect, Ref, Str};
use std::collections::{BTreeMap, BTreeSet};
use ttf_parser::{Face, GlyphId};

// Use the same OFL-licensed font already bundled in the app.
const FONT_FILE: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../apps/pile-plan-studio/src/openaec/fonts/NotoSans-Regular.ttf"
));
const FONT_NAME: Name<'static> = Name(b"NotoSans-Regular");
const SYSTEM: SystemInfo<'static> = SystemInfo {
    registry: Str(b"Adobe"),
    ordering: Str(b"Identity"),
    supplement: 0,
};

pub(super) struct PlotFont {
    face: Face<'static>,
    glyphs: BTreeMap<char, (u16, GlyphId)>,
}

impl PlotFont {
    pub fn from_entities(entities: &[EntityType]) -> Result<Self, Error> {
        let face = Face::parse(FONT_FILE, 0).map_err(|_| "Could not read the bundled PDF font")?;
        let chars: BTreeSet<_> = entities
            .iter()
            .filter_map(|entity| match entity {
                EntityType::Text(text) => Some(text.value.chars()),
                _ => None,
            })
            .flatten()
            .collect();
        let mut glyphs = BTreeMap::new();
        for (index, ch) in chars.into_iter().enumerate() {
            let code = u16::try_from(index + 1)?;
            let glyph = face.glyph_index(ch).unwrap_or(GlyphId(0));
            glyphs.insert(ch, (code, glyph));
        }
        Ok(Self { face, glyphs })
    }

    pub fn encode(&self, text: &str) -> Vec<u8> {
        text.chars()
            .flat_map(|ch| self.glyphs[&ch].0.to_be_bytes())
            .collect()
    }

    pub fn size(&self, text: &Text) -> f64 {
        text.height * f64::from(self.face.units_per_em()) / f64::from(self.cap_height())
    }

    pub fn baseline(&self, text: &Text) -> Point {
        if text.horizontal_alignment == TextHorizontalAlignment::Center {
            let point = text.alignment_point.unwrap_or(text.insertion_point);
            [point.x - self.width(text) / 2., point.y]
        } else {
            [text.insertion_point.x, text.insertion_point.y]
        }
    }

    pub fn bounds(&self, text: &Text) -> BoundingBox3D {
        let [x, y] = self.baseline(text);
        let scale = self.size(text) / f64::from(self.face.units_per_em());
        BoundingBox3D {
            min: Vector3::new(x, y + f64::from(self.face.descender()) * scale, 0.),
            max: Vector3::new(
                x + self.width(text),
                y + f64::from(self.face.ascender()) * scale,
                0.,
            ),
        }
    }

    pub fn embed(&self, pdf: &mut Pdf, reference: Ref) -> Result<(), Error> {
        let mut next = reference;
        next.bump();
        let cid = next.bump();
        let descriptor = next.bump();
        let file = next.bump();
        let unicode = next.bump();
        let cid_map = next.bump();
        let mut char_map = UnicodeCmap::new(Name(b"PilePlanText"), SYSTEM);
        let mut glyph_map = vec![0, 0]; // CID 0 is .notdef.
        for (&ch, &(code, glyph)) in &self.glyphs {
            char_map.pair(code, ch);
            glyph_map.extend_from_slice(&glyph.0.to_be_bytes());
        }
        let norm = 1000. / f32::from(self.face.units_per_em());
        pdf.type0_font(reference)
            .base_font(FONT_NAME)
            .encoding_predefined(Name(b"Identity-H"))
            .descendant_font(cid)
            .to_unicode(unicode);
        pdf.cid_font(cid)
            .subtype(CidFontType::Type2)
            .base_font(FONT_NAME)
            .system_info(SYSTEM)
            .font_descriptor(descriptor)
            .cid_to_gid_map_stream(cid_map)
            .widths()
            .consecutive(
                1,
                self.glyphs
                    .values()
                    .map(|&(_, glyph)| f32::from(self.advance(glyph)) * norm),
            );
        let bbox = self.face.global_bounding_box();
        pdf.font_descriptor(descriptor)
            .name(FONT_NAME)
            .flags(FontFlags::NON_SYMBOLIC)
            .bbox(Rect::new(
                f32::from(bbox.x_min) * norm,
                f32::from(bbox.y_min) * norm,
                f32::from(bbox.x_max) * norm,
                f32::from(bbox.y_max) * norm,
            ))
            .italic_angle(0.)
            .ascent(f32::from(self.face.ascender()) * norm)
            .descent(f32::from(self.face.descender()) * norm)
            .cap_height(f32::from(self.cap_height()) * norm)
            .stem_v(80.)
            .font_file2(file);
        pdf.stream(file, &compress(FONT_FILE)?)
            .filter(Filter::FlateDecode)
            .pair(Name(b"Length1"), FONT_FILE.len() as i32);
        pdf.stream(unicode, &char_map.finish());
        pdf.stream(cid_map, &glyph_map);
        Ok(())
    }

    fn width(&self, text: &Text) -> f64 {
        let advance: f64 = text
            .value
            .chars()
            .map(|c| f64::from(self.advance(self.glyphs[&c].1)))
            .sum();
        advance * self.size(text) / f64::from(self.face.units_per_em())
    }

    fn advance(&self, glyph: GlyphId) -> u16 {
        self.face.glyph_hor_advance(glyph).unwrap_or(0)
    }

    fn cap_height(&self) -> i16 {
        self.face
            .capital_height()
            .unwrap_or(self.face.ascender())
            .max(1)
    }
}

mod region;

use super::{CadNumberSize, Point};

#[derive(Clone, Copy)]
pub(super) struct Rect {
    pub min: Point,
    pub max: Point,
}

impl Rect {
    pub fn from_points(points: impl IntoIterator<Item = Point>) -> Self {
        let mut points = points.into_iter();
        let first = points.next().unwrap_or([0., 0.]);
        points.fold(
            Self {
                min: first,
                max: first,
            },
            |rect, point| Self {
                min: [rect.min[0].min(point[0]), rect.min[1].min(point[1])],
                max: [rect.max[0].max(point[0]), rect.max[1].max(point[1])],
            },
        )
    }

    pub fn around([x, y]: Point, radius: f64) -> Self {
        Self {
            min: [x - radius, y - radius],
            max: [x + radius, y + radius],
        }
    }

    fn overlaps(self, other: Self) -> bool {
        (0..2).all(|axis| self.min[axis] < other.max[axis] && other.min[axis] < self.max[axis])
    }

    fn closest(self, point: Point) -> Point {
        [
            point[0].clamp(self.min[0], self.max[0]),
            point[1].clamp(self.min[1], self.max[1]),
        ]
    }

    fn intersects(self, (start, end): Segment) -> bool {
        let (mut near, mut far) = (0.0_f64, 1.0_f64);
        for axis in 0..2 {
            let delta = end[axis] - start[axis];
            if delta == 0. {
                if start[axis] <= self.min[axis] || start[axis] >= self.max[axis] {
                    return false;
                }
                continue;
            }
            let a = (self.min[axis] - start[axis]) / delta;
            let b = (self.max[axis] - start[axis]) / delta;
            near = near.max(a.min(b));
            far = far.min(a.max(b));
            if near >= far {
                return false;
            }
        }
        true
    }

    fn corners(self) -> [Point; 4] {
        let [left, bottom] = self.min;
        let [right, top] = self.max;
        [[left, bottom], [left, top], [right, bottom], [right, top]]
    }
}

pub(super) type Segment = (Point, Point);

#[derive(Clone, Copy)]
pub(super) struct LabelPosition {
    pub baseline: Point,
    pub leader: Option<Segment>,
    pub centered: bool,
}

pub(super) struct PointLabel<'a> {
    pub value: &'a str,
    pub anchor: Point,
    pub radius: f64,
    pub obstacle: usize,
}

pub(super) struct LabelLayout {
    drawing: Rect,
    unit: f64,
    obstacles: Vec<Rect>,
    boundaries: Vec<Segment>,
    text: Vec<Rect>,
    leaders: Vec<Segment>,
}

const DIRECTIONS: [Point; 8] = [
    [1., 1.],
    [1., 0.],
    [1., -1.],
    [0., 1.],
    [0., -1.],
    [-1., 1.],
    [-1., 0.],
    [-1., -1.],
];

impl LabelLayout {
    pub fn new(drawing: Rect, unit: f64, obstacles: Vec<Rect>, boundaries: Vec<Segment>) -> Self {
        Self {
            drawing,
            unit,
            obstacles,
            boundaries,
            text: vec![],
            leaders: vec![],
        }
    }

    pub fn right_edge(&self) -> f64 {
        self.text
            .iter()
            .map(|rect| rect.max[0])
            .fold(self.drawing.max[0], f64::max)
    }

    pub fn place_piles(
        &mut self,
        piles: &[PointLabel<'_>],
        number_size: CadNumberSize,
    ) -> Vec<Option<(LabelPosition, f64)>> {
        struct Trial {
            count: usize,
            positions: Vec<Option<(LabelPosition, f64)>>,
            text: Vec<Rect>,
            leaders: Vec<Segment>,
        }

        let mut clusters = nearby_piles(piles, 10. * self.unit);
        for cluster in &mut clusters {
            cluster.sort_by(|&a, &b| piles[a].anchor[1].total_cmp(&piles[b].anchor[1]));
        }

        let checkpoint = (self.text.len(), self.leaders.len());
        let mut best: Option<Trial> = None;
        // Try the usual plot height first. Each trial respects the same
        // symbol, text and boundary clearances and can use compact labels
        // at individual obstructions. Ties keep the larger main height.
        let factors = [2.5, 2.3, 2.1, 1.9];
        let factors = match number_size {
            CadNumberSize::Automatic => &factors[..],
            CadNumberSize::Compact => &factors[2..],
        };
        for &factor in factors {
            let height = factor * self.unit;
            let compact = (0.8 * height).max(1.7 * self.unit);
            let trial: Vec<_> = self
                .place_piles_at_height(piles, &clusters, height)
                .into_iter()
                .zip(piles)
                .map(|(position, pile)| {
                    position.map(|position| (position, height)).or_else(|| {
                        self.place_point_label(
                            pile.value,
                            compact,
                            pile.anchor,
                            pile.radius,
                            Some(pile.obstacle),
                            true,
                        )
                        .map(|position| (position, compact))
                    })
                })
                .collect();
            let count = trial.iter().flatten().count();
            if count == piles.len() {
                return trial;
            }
            let text = self.text.split_off(checkpoint.0);
            let leaders = self.leaders.split_off(checkpoint.1);
            if best.as_ref().is_none_or(|previous| count > previous.count) {
                best = Some(Trial {
                    count,
                    positions: trial,
                    text,
                    leaders,
                });
            }
        }

        let best = best.expect("at least one label height was tried");
        self.text.extend(best.text);
        self.leaders.extend(best.leaders);
        best.positions
    }

    fn place_piles_at_height(
        &mut self,
        piles: &[PointLabel<'_>],
        clusters: &[Vec<usize>],
        height: f64,
    ) -> Vec<Option<LabelPosition>> {
        let mut positions = vec![None; piles.len()];
        for cluster in clusters {
            let has_neighbors = cluster.len() > 1;
            if has_neighbors && self.place_rows(piles, cluster, height, &mut positions) {
                continue;
            }
            for (axis, mut run) in aligned_runs(piles, cluster, self.unit) {
                run.retain(|&index| positions[index].is_none());
                if run.len() >= 3 {
                    self.place_aligned_run(piles, &run, axis, height, &mut positions);
                }
            }
            for &index in cluster {
                if positions[index].is_some() {
                    continue;
                }
                let pile = &piles[index];
                positions[index] = self.place_point_label(
                    pile.value,
                    height,
                    pile.anchor,
                    pile.radius,
                    Some(pile.obstacle),
                    has_neighbors,
                );
            }
        }
        positions
    }

    fn place_rows(
        &mut self,
        piles: &[PointLabel<'_>],
        cluster: &[usize],
        height: f64,
        positions: &mut [Option<LabelPosition>],
    ) -> bool {
        let row_end = piles[cluster[0]].anchor[1] + self.unit;
        let (lower, upper) =
            cluster.split_at(cluster.partition_point(|&i| piles[i].anchor[1] <= row_end));
        if let (Some(&first), Some(&last)) = (upper.first(), upper.last()) {
            if piles[last].anchor[1] - piles[first].anchor[1] > self.unit {
                return false;
            }
        }

        // Put two close rows on the outside of the cluster. A single row
        // uses the same side for all numbers and can use either side.
        let directions: &[f64] = if upper.is_empty() { &[1., -1.] } else { &[-1.] };
        let checkpoint = (self.text.len(), self.leaders.len());
        for &direction in directions {
            let mut labels = vec![];
            if self.place_row(piles, lower, direction, height, &mut labels)
                && self.place_row(piles, upper, 1., height, &mut labels)
            {
                for (index, label) in labels {
                    positions[index] = Some(label);
                }
                return true;
            }
            self.text.truncate(checkpoint.0);
            self.leaders.truncate(checkpoint.1);
        }
        false
    }

    fn place_row(
        &mut self,
        piles: &[PointLabel<'_>],
        row: &[usize],
        direction: f64,
        height: f64,
        labels: &mut Vec<(usize, LabelPosition)>,
    ) -> bool {
        if row.is_empty() {
            return true;
        }
        let edge = row
            .iter()
            .map(|&i| direction * piles[i].anchor[1] + piles[i].radius)
            .fold(f64::NEG_INFINITY, f64::max);
        let target_y = direction * (edge + 1.8 * self.unit);
        for &index in row {
            let Some((rect, position)) =
                self.aligned_label(&piles[index], height, 0, direction, target_y)
            else {
                return false;
            };
            self.text.push(rect);
            self.leaders.extend(position.leader);
            labels.push((index, position));
        }
        true
    }

    fn place_aligned_run(
        &mut self,
        piles: &[PointLabel<'_>],
        run: &[usize],
        axis: usize,
        height: f64,
        positions: &mut [Option<LabelPosition>],
    ) {
        let across = 1 - axis;
        let outer_edge = |direction: f64| {
            let edge = run
                .iter()
                .map(|&index| {
                    let pile = &piles[index];
                    direction * pile.anchor[across] + pile.radius
                })
                .fold(f64::NEG_INFINITY, f64::max);
            direction * (edge + 1.8 * self.unit)
        };
        let targets = [outer_edge(1.), outer_edge(-1.)];
        let checkpoint = (self.text.len(), self.leaders.len());
        let mut best = vec![];
        // Shift a common track past a nearby outline instead of making
        // each label find a different place along the edge.
        'arrangements: for offsets in [
            [0., 0.],
            [1.8, 0.],
            [0., 1.8],
            [1.8, 1.8],
            [3.6, 0.],
            [0., 3.6],
            [3.6, 3.6],
        ] {
            // Prefer one side throughout. If text is wider than the pitch,
            // two tracks can still work by alternating sides.
            for sides in [[0, 0], [1, 1], [0, 1], [1, 0]] {
                // A single track never uses the other side's offset.
                if sides[0] == sides[1] && offsets[1 - sides[0]] != 0. {
                    continue;
                }
                let mut trial = vec![];
                for (step, &index) in run.iter().enumerate() {
                    let side = sides[step % 2];
                    let direction = if side == 0 { 1. } else { -1. };
                    let target = targets[side] + direction * offsets[side] * self.unit;
                    if let Some((rect, mut position)) =
                        self.aligned_label(&piles[index], height, axis, direction, target)
                    {
                        // Alignment identifies a nearby number on a single
                        // track. Keep the line for staggered or displaced text.
                        if sides[0] == sides[1]
                            && position.leader.is_some_and(|(start, end)| {
                                (end[across] - start[across]).abs() <= 2.6 * self.unit
                            })
                        {
                            position.leader = None;
                        }
                        self.text.push(rect);
                        self.leaders.extend(position.leader);
                        trial.push((index, rect, position));
                    }
                }
                self.text.truncate(checkpoint.0);
                self.leaders.truncate(checkpoint.1);
                if trial.len() > best.len() {
                    best = trial;
                }
                if best.len() == run.len() {
                    break 'arrangements;
                }
            }
        }
        if best.len() >= 3 {
            for (index, rect, position) in best {
                self.text.push(rect);
                self.leaders.extend(position.leader);
                positions[index] = Some(position);
            }
        }
    }

    fn aligned_label(
        &self,
        pile: &PointLabel<'_>,
        height: f64,
        axis: usize,
        direction: f64,
        target: f64,
    ) -> Option<(Rect, LabelPosition)> {
        let across = 1 - axis;
        let width = text_width(pile.value, height);
        let inset = text_rect([0., 0.], width, height);
        let mut baseline = pile.anchor;
        baseline[axis] -= (inset.min[axis] + inset.max[axis]) / 2.;
        baseline[across] = target
            - if direction > 0. {
                inset.min[across]
            } else {
                inset.max[across]
            };
        let rect = text_rect(baseline, width, height);
        let mut start = pile.anchor;
        let mut end = pile.anchor;
        start[across] += direction * pile.radius;
        end[across] = target;
        let leader = (start, end);
        if !self.fits(rect) || !self.leader_fits(leader, Some(pile.obstacle)) {
            return None;
        }
        let centered = axis == 0;
        if centered {
            baseline[0] = pile.anchor[0];
        }
        Some((
            rect,
            LabelPosition {
                baseline,
                leader: Some(leader),
                centered,
            },
        ))
    }

    pub fn place_point(
        &mut self,
        value: &str,
        height: f64,
        anchor: Point,
        radius: f64,
        obstacle: Option<usize>,
    ) -> Option<LabelPosition> {
        self.place_point_label(value, height, anchor, radius, obstacle, false)
    }

    fn place_point_label(
        &mut self,
        value: &str,
        height: f64,
        anchor: Point,
        radius: f64,
        obstacle: Option<usize>,
        require_leader: bool,
    ) -> Option<LabelPosition> {
        let width = text_width(value, height);
        for step in 0..=6 {
            let distance = radius + (1.2 + f64::from(step) * 2.2) * self.unit;
            for [dx, dy] in DIRECTIONS {
                let baseline = [
                    anchor[0] + dx * (distance + width / 2.) - width / 2.,
                    anchor[1] + dy * (distance + height / 2.) - height / 2.,
                ];
                let rect = text_rect(baseline, width, height);
                if !self.fits(rect) {
                    continue;
                }
                let leader = (require_leader || step > 0).then(|| leader_to(anchor, radius, rect));
                if leader.is_some_and(|line| !self.leader_fits(line, obstacle)) {
                    continue;
                }
                return Some(self.reserve(baseline, rect, leader));
            }
        }

        None
    }

    fn fits(&self, rect: Rect) -> bool {
        self.obstacles
            .iter()
            .chain(&self.text)
            .all(|existing| !existing.overlaps(rect))
            && self.boundaries.iter().all(|line| !rect.intersects(*line))
            && self.leaders.iter().all(|line| !rect.intersects(*line))
    }

    fn reserve(&mut self, baseline: Point, rect: Rect, leader: Option<Segment>) -> LabelPosition {
        self.text.push(rect);
        self.leaders.extend(leader);
        LabelPosition {
            baseline,
            leader,
            centered: false,
        }
    }

    fn leader_fits(&self, line: Segment, obstacle: Option<usize>) -> bool {
        self.obstacles
            .iter()
            .enumerate()
            .all(|(i, rect)| Some(i) == obstacle || !rect.intersects(line))
            && self.text.iter().all(|text| !text.intersects(line))
            && self
                .leaders
                .iter()
                .all(|&other| !segments_cross(line, other))
    }
}

fn aligned_runs(
    piles: &[PointLabel<'_>],
    cluster: &[usize],
    unit: f64,
) -> Vec<(usize, Vec<usize>)> {
    let mut runs = Vec::new();
    for axis in 0..2 {
        let across = 1 - axis;
        let mut indices = cluster.to_vec();
        indices.sort_by(|&a, &b| piles[a].anchor[across].total_cmp(&piles[b].anchor[across]));
        let mut remaining = indices.as_slice();
        while let Some(&first) = remaining.first() {
            let edge = piles[first].anchor[across] + unit;
            let end = remaining.partition_point(|&index| piles[index].anchor[across] <= edge);
            let (stripe, rest) = remaining.split_at(end);
            remaining = rest;
            let mut line = stripe.to_vec();
            line.sort_by(|&a, &b| piles[a].anchor[axis].total_cmp(&piles[b].anchor[axis]));
            for run in
                line.chunk_by(|&a, &b| piles[b].anchor[axis] - piles[a].anchor[axis] <= 14. * unit)
            {
                if run.len() >= 3 {
                    runs.push((axis, run.to_vec()));
                }
            }
        }
    }
    runs.sort_by_key(|(axis, run)| (std::cmp::Reverse(run.len()), *axis));
    runs
}

fn nearby_piles(piles: &[PointLabel<'_>], distance: f64) -> Vec<Vec<usize>> {
    let mut visited = vec![false; piles.len()];
    let mut clusters = vec![];
    for first in 0..piles.len() {
        if visited[first] {
            continue;
        }
        let mut cluster = vec![first];
        visited[first] = true;
        let mut cursor = 0;
        while cursor < cluster.len() {
            let [x, y] = piles[cluster[cursor]].anchor;
            for (index, pile) in piles.iter().enumerate() {
                let [px, py] = pile.anchor;
                if !visited[index] && (px - x).hypot(py - y) <= distance {
                    cluster.push(index);
                    visited[index] = true;
                }
            }
            cursor += 1;
        }
        clusters.push(cluster);
    }
    clusters
}

fn segments_cross((a, b): Segment, (c, d): Segment) -> bool {
    fn side([ax, ay]: Point, [bx, by]: Point, [px, py]: Point) -> f64 {
        (bx - ax) * (py - ay) - (by - ay) * (px - ax)
    }
    fn straddles(a: Point, b: Point, c: Point, d: Point) -> bool {
        let c = side(a, b, c);
        let d = side(a, b, d);
        c.min(d) <= 0. && c.max(d) >= 0.
    }
    let bounds = Rect::from_points([a, b]);
    let other = Rect::from_points([c, d]);
    (0..2).all(|axis| bounds.min[axis] <= other.max[axis] && other.min[axis] <= bounds.max[axis])
        && straddles(a, b, c, d)
        && straddles(c, d, a, b)
}

fn text_rect([x, y]: Point, width: f64, height: f64) -> Rect {
    Rect {
        min: [x - 0.17 * height, y - 0.32 * height],
        max: [x + width + 0.17 * height, y + 1.23 * height],
    }
}

pub(super) fn text_width(value: &str, height: f64) -> f64 {
    height
        * value
            .chars()
            .map(|c| match c {
                'M' | 'W' | 'm' | 'w' | '@' => 1.45,
                ' ' | '-' | '.' | ',' | ':' | '(' | ')' => 0.55,
                '0'..='9' => 0.88,
                c if c as u32 >= 0x2e80 => 1.5,
                _ => 1.,
            })
            .sum::<f64>()
}

fn leader_to(anchor: Point, radius: f64, target: Rect) -> Segment {
    let end = target.closest(anchor);
    let [dx, dy] = [end[0] - anchor[0], end[1] - anchor[1]];
    let length = dx.hypot(dy);
    let distance = radius.min(length);
    let start = if length == 0. {
        anchor
    } else {
        [
            anchor[0] + distance * dx / length,
            anchor[1] + distance * dy / length,
        ]
    };
    (start, end)
}

//! Small, solver-independent linear expressions used only by the ILP builder.
use std::{
    collections::BTreeMap,
    iter::Sum,
    ops::{Add, AddAssign, Mul, Sub},
};

#[derive(Clone, Copy, Debug)]
pub(super) struct Variable(pub usize);
#[derive(Clone, Default)]
pub(super) struct Expression {
    pub terms: BTreeMap<usize, f64>,
    pub constant: f64,
}
impl From<Variable> for Expression {
    fn from(v: Variable) -> Self {
        Self {
            terms: [(v.0, 1.0)].into(),
            constant: 0.0,
        }
    }
}
impl From<f64> for Expression {
    fn from(constant: f64) -> Self {
        Self {
            constant,
            ..Self::default()
        }
    }
}
impl<T: Into<Expression>> AddAssign<T> for Expression {
    fn add_assign(&mut self, rhs: T) {
        let rhs = rhs.into();
        self.constant += rhs.constant;
        for (v, c) in rhs.terms {
            *self.terms.entry(v).or_default() += c;
        }
    }
}
impl<T: Into<Expression>> Add<T> for Expression {
    type Output = Self;
    fn add(mut self, rhs: T) -> Self {
        self += rhs;
        self
    }
}
impl<T: Into<Expression>> Sub<T> for Expression {
    type Output = Self;
    fn sub(mut self, rhs: T) -> Self {
        let rhs = rhs.into();
        self.constant -= rhs.constant;
        for (v, c) in rhs.terms {
            *self.terms.entry(v).or_default() -= c;
        }
        self
    }
}
impl<T: Into<Expression>> Add<T> for Variable {
    type Output = Expression;
    fn add(self, rhs: T) -> Expression {
        Expression::from(self) + rhs
    }
}
impl<T: Into<Expression>> Sub<T> for Variable {
    type Output = Expression;
    fn sub(self, rhs: T) -> Expression {
        Expression::from(self) - rhs
    }
}
impl Mul<Variable> for f64 {
    type Output = Expression;
    fn mul(self, rhs: Variable) -> Expression {
        Expression {
            terms: [(rhs.0, self)].into(),
            constant: 0.0,
        }
    }
}
impl<T: Into<Expression>> Sum<T> for Expression {
    fn sum<I: Iterator<Item = T>>(iter: I) -> Self {
        iter.fold(Self::default(), |a, b| a + b)
    }
}
pub(super) struct Constraint {
    pub expression: Expression,
    pub equal: bool,
}
impl Expression {
    pub fn eq(self, rhs: impl Into<f64>) -> Constraint {
        Constraint {
            expression: self - rhs.into(),
            equal: true,
        }
    }
    pub fn leq(self, rhs: impl Into<f64>) -> Constraint {
        Constraint {
            expression: self - rhs.into(),
            equal: false,
        }
    }
    pub fn geq(self, rhs: impl Into<f64>) -> Constraint {
        Constraint {
            expression: Expression::from(rhs.into()) - self,
            equal: false,
        }
    }
}
pub(super) struct VariableDefinition {
    pub min: f64,
    pub max: f64,
    pub initial: Option<f64>,
}
pub(super) fn variable() -> VariableDefinition {
    VariableDefinition {
        min: 0.,
        max: f64::INFINITY,
        initial: None,
    }
}
impl VariableDefinition {
    pub fn binary(mut self) -> Self {
        self.max = 1.;
        self
    }
    pub fn integer(self) -> Self {
        self
    }
    pub fn min(mut self, v: impl Into<f64>) -> Self {
        self.min = v.into();
        self
    }
    pub fn max(mut self, v: impl Into<f64>) -> Self {
        self.max = v.into();
        self
    }
    pub fn initial(mut self, v: impl Into<f64>) -> Self {
        self.initial = Some(v.into());
        self
    }
    pub fn get_initial(&self) -> Option<f64> {
        self.initial
    }
}
#[derive(Default)]
pub(super) struct Variables(pub Vec<VariableDefinition>);
impl Variables {
    pub fn add(&mut self, v: VariableDefinition) -> Variable {
        let id = Variable(self.0.len());
        self.0.push(v);
        id
    }
    pub fn iter_variables_with_def(&self) -> impl Iterator<Item = (Variable, &VariableDefinition)> {
        self.0.iter().enumerate().map(|(i, d)| (Variable(i), d))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn expressions_preserve_signs_constants_and_duplicate_terms() {
        let a = Variable(0);
        let b = Variable(1);
        let c = (a - 2.0 * b + a + Expression::from(3.)).geq(7);
        assert_eq!(c.expression.terms[&0], -2.);
        assert_eq!(c.expression.terms[&1], 2.);
        assert_eq!(c.expression.constant, 4.);
        assert!(!c.equal);
        let c = [a, b, a].into_iter().sum::<Expression>().eq(1);
        assert_eq!(c.expression.terms[&0], 2.);
        assert_eq!(c.expression.constant, -1.);
        assert!(c.equal);
    }
}

import type { Flashcard } from './flashcards'

// Hand-written flashcards for Final chapters that had no cards (203, 204, 215, 216).
export const HANDWRITTEN_FLASHCARDS: Flashcard[] = [
  // Chapter 203: Capital Budgeting under Risk & Portfolio Theory
  { id: 'hf203-1', chapterId: 203, front: 'Sensitivity analysis', back: 'Measures how NPV changes with a one-at-a-time change in an input variable. Example: NPV falls ₹2L for every ₹1L rise in cost.' },
  { id: 'hf203-2', chapterId: 203, front: 'Scenario analysis', back: 'Evaluates best, worst and base-case combinations of several variables together. Example: Best-case sales × best-case margin.' },
  { id: 'hf203-3', chapterId: 203, front: 'Probability tree', back: 'Assigns probabilities to branches of cash flows to compute expected NPV. Example: 60% chance of ₹10L, 40% of ₹4L.' },
  { id: 'hf203-4', chapterId: 203, front: 'Risk-adjusted discount rate (RADR)', back: 'Discount rate = risk-free rate + risk premium; riskier projects use higher rates. Example: 8% + 4% = 12%.' },
  { id: 'hf203-5', chapterId: 203, front: 'Certainty equivalent', back: 'Risky cash flow × certainty factor, then discounted at the risk-free rate. Example: ₹1,00,000 × 0.8 = ₹80,000.' },
  { id: 'hf203-6', chapterId: 203, front: 'Monte Carlo simulation', back: 'Generates thousands of random outcomes to build a distribution of NPV. Example: 95% of simulated NPVs exceed ₹5L.' },
  { id: 'hf203-7', chapterId: 203, front: 'Beta (β)', back: 'Measures systematic risk relative to the market. Example: β = 1.5 means the stock moves 1.5× the market.' },
  { id: 'hf203-8', chapterId: 203, front: 'CAPM', back: 'Expected return = Rf + β × (Rm − Rf). Example: 7% + 1.2 × 8% = 16.6%.' },
  { id: 'hf203-9', chapterId: 203, front: 'Systematic vs unsystematic risk', back: 'Systematic risk affects the whole market; unsystematic risk is firm-specific and is removed by diversification. Example: Inflation (systematic), strike (unsystematic).' },
  { id: 'hf203-10', chapterId: 203, front: 'Coefficient of variation', back: 'Standard deviation ÷ expected return; compares risk per unit of return. Example: 20% ÷ 10% = 2.0.' },

  // Chapter 204: Derivatives, Business Valuation & Restructuring
  { id: 'hf204-1', chapterId: 204, front: 'Derivative', back: 'A contract whose value derives from an underlying asset, index or rate. Example: A futures contract on gold.' },
  { id: 'hf204-2', chapterId: 204, front: 'Futures', back: 'Standardised, exchange-traded contract to buy/sell at a future date at a fixed price. Example: Nifty futures.' },
  { id: 'hf204-3', chapterId: 204, front: 'Forwards', back: 'Customised over-the-counter contract to buy/sell at a future date. Example: A bank forward on USD/INR.' },
  { id: 'hf204-4', chapterId: 204, front: 'Call option', back: 'Right (not obligation) to buy the underlying at the strike price. Example: Buy Reliance at ₹2,500 by December.' },
  { id: 'hf204-5', chapterId: 204, front: 'Put option', back: 'Right to sell the underlying at the strike price. Example: Sell gold at ₹70,000 by March.' },
  { id: 'hf204-6', chapterId: 204, front: 'Intrinsic value of a call', back: 'Max(0, spot − strike). Example: Spot ₹2,600, strike ₹2,500 → ₹100.' },
  { id: 'hf204-7', chapterId: 204, front: 'Interest rate swap', back: 'Exchange of interest payment streams, e.g. fixed for floating. Example: Firm swaps 9% fixed for MIBOR + 1%.' },
  { id: 'hf204-8', chapterId: 204, front: 'DCF valuation', back: 'Firm value = present value of expected future free cash flows. Example: ₹100L FCF discounted at 12%.' },
  { id: 'hf204-9', chapterId: 204, front: 'Enterprise value', back: 'Market cap + debt − cash (a takeover price proxy). Example: ₹500L + ₹100L − ₹20L = ₹580L.' },
  { id: 'hf204-10', chapterId: 204, front: 'Amalgamation', back: 'Two or more companies combine into one entity. Example: A and B merge to form C.' },
  { id: 'hf204-11', chapterId: 204, front: 'LBO (leveraged buyout)', back: 'Acquisition financed largely by debt secured on the target’s assets. Example: PE firm buys a company with 70% debt.' },
  { id: 'hf204-12', chapterId: 204, front: 'Comparable multiples', back: 'Peer P/E or EV/EBITDA multiples applied to the target. Example: Target EPS ₹10 × peer P/E 15 = ₹150.' },

  // Chapter 215: Strategic Performance Management Frameworks
  { id: 'hf215-1', chapterId: 215, front: 'Balanced Scorecard', back: 'Translates strategy into four perspectives: financial, customer, internal process, learning & growth. Example: Customer satisfaction KPI.' },
  { id: 'hf215-2', chapterId: 215, front: 'Lag indicator', back: 'Measures outcomes of past actions. Example: Profitability, market share.' },
  { id: 'hf215-3', chapterId: 215, front: 'Lead indicator', back: 'Predicts future performance. Example: Training hours, on-time delivery.' },
  { id: 'hf215-4', chapterId: 215, front: 'Strategy map', back: 'Links objectives across scorecard perspectives in cause-and-effect chains. Example: Training → quality → satisfaction → revenue.' },
  { id: 'hf215-5', chapterId: 215, front: 'DuPont analysis', back: 'ROE = profit margin × asset turnover × equity multiplier. Example: 5% × 2 × 1.5 = 15%.' },
  { id: 'hf215-6', chapterId: 215, front: 'EVA (Economic Value Added)', back: 'NOPAT − (capital × cost of capital); positive EVA = value creation. Example: ₹50L − (₹400L × 10%) = ₹10L.' },
  { id: 'hf215-7', chapterId: 215, front: 'Performance prism', back: 'Stakeholder satisfaction and contribution, strategies, processes, capabilities. Example: Employee satisfaction drives retention.' },
  { id: 'hf215-8', chapterId: 215, front: 'Benchmarking', back: 'Comparing performance against best-in-class practices. Example: Benchmarking cycle time against a leader.' },
  { id: 'hf215-9', chapterId: 215, front: 'Kaizen costing', back: 'Continuous small cost reductions through improvement activities. Example: Weekly waste-reduction targets.' },
  { id: 'hf215-10', chapterId: 215, front: 'Critical success factors (CSFs)', back: 'The few areas where performance must excel for the strategy to succeed. Example: On-time delivery for an e-commerce firm.' },

  // Chapter 216: Business & Intangible Asset Valuation
  { id: 'hf216-1', chapterId: 216, front: 'Intangible asset', back: 'Non-physical asset with future economic benefit. Example: Brand, patent, software.' },
  { id: 'hf216-2', chapterId: 216, front: 'Relief from royalty', back: 'Intangible value = PV of royalties saved by owning the asset. Example: Brand saving 2% royalty on sales.' },
  { id: 'hf216-3', chapterId: 216, front: 'Excess earnings method', back: 'Value = PV of earnings above a normal return on net tangible assets. Example: Super profit of ₹20L capitalised at 20%.' },
  { id: 'hf216-4', chapterId: 216, front: 'Super profit', back: 'Actual profit − normal profit (normal rate × capital employed). Example: ₹90L − ₹70L = ₹20L.' },
  { id: 'hf216-5', chapterId: 216, front: 'NAV per share', back: 'Net assets ÷ number of shares. Example: ₹500L ÷ 50L shares = ₹10.' },
  { id: 'hf216-6', chapterId: 216, front: 'P/E valuation', back: 'Share value = EPS × P/E multiple. Example: EPS ₹8 × P/E 12 = ₹96.' },
  { id: 'hf216-7', chapterId: 216, front: 'Gordon growth model', back: 'Price = D1 ÷ (ke − g). Example: ₹5 ÷ (12% − 5%) = ₹71.4.' },
  { id: 'hf216-8', chapterId: 216, front: 'Terminal value', back: 'Value beyond the explicit forecast period, usually via perpetuity growth. Example: FCF × (1+g) ÷ (WACC − g).' },
  { id: 'hf216-9', chapterId: 216, front: 'Control premium', back: 'Extra amount paid for voting control of a target. Example: 30% above the market price.' },
  { id: 'hf216-10', chapterId: 216, front: 'Synergy value', back: 'Increase in combined value from a merger beyond the sum of parts. Example: Cost savings of ₹10L post-merger.' },
]

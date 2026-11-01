# Buy or rent: housing costs and budget

## Routes and presentation
- `/ro/cumparare-sau-chirie`, `/ru/cumparare-sau-chirie`, `/en/cumparare-sau-chirie` have localized server metadata, self-canonicals, reciprocal language alternates, sitemap entries and WebApplication JSON-LD. The unprefixed route is noindex.
- Free, browser-local calculator linked from the footer and unlocked sale/rent estimates.
- Two primary questions: compare buying with rent; find a home price that fits the current rental budget. A secondary text button opens renovation of an already-owned home to move in and stop renting.
- Compare mode shows monthly payments, total cash paid over 5-30 years, then home ownership and remaining principal/loan duration. Total rent is explicitly money paid, not savings or wealth. Buying payments are not labeled a loss: principal buys the home.
- Total-payment comparison uses horizontal stacked bars on one shared EUR scale: down payment/principal, interest and other costs for buying; rent and other costs for renting. Segment labels include amounts; zero segments are omitted. The end-state panel uses home icons and loan-principal repayment progress, with remaining debt and term. Cash purchases show no loan. In renovation mode, the renting alternative retains the already-owned unrenovated home.
- Affordability shows a possible home price, loan/payment breakdown, upfront cash and selectable 10/20/30-year examples. Bank income, minimum down payment and eligibility requirements are not simulated.
- Renovation mode shows costs after moving, full repair recovery, payments over the selected period and remaining debt. Recovery and loan payoff are distinct.
- Input values and units stay on one line on desktop and mobile. Fields share label/input/help grid rows so longer localized labels do not misalign neighboring inputs.
- Body text is 14-17px, with large labeled amounts. Additional expenses, provenance, detailed totals, annual table and methodology are collapsed. No investment wealth, appreciation, sale proceeds, future-euro switch or winner verdict.

## Data and estimation
- Inputs and rates are examples. Growth rates default to zero; optional rent growth and expense inflation are user assumptions.
- `BuyRentEstimateAction` imports only full-access sale/rent market estimates, comparable count, observation date when supplied, input criteria and import time. No additional fetch or unlock.
- Estimator links prefill the other estimate's criteria when available; usual access/credit rules apply. English explicitly links to the Romanian estimator.
- Draft, scenario and provenance are stored in same-tab sessionStorage (`catdai-buy-rent-v2`). The version separates this model from the retired investment calculator. Import keeps the saved language and preserves affordability mode for a rent import; price imports open comparison.
- Editing a price removes its market-source label. Manual/example field captions and the introductory example notice are omitted; provenance remains in the sources disclosure. Manual calculations work without storage; import failure explains manual copying.
- Imported estimates use asking-price listings, not completed transactions. Observation and import dates are separate.

## Calculation
- Fixed-rate monthly amortization, including zero interest and cash-only purchase. Down payment cannot exceed price. Validation considers only the selected scenario's fields.
- Purchase cash paid = down payment + buying fees + initial renovation + principal and interest paid in the horizon + ongoing owner costs. Initial renovation does not automatically increase property value, which is not modeled.
- Rental cash paid = rental setup + rent + renter extras. Show rent alone separately. Mortgage payments end after the term; maintenance continues.
- Affordability payment capacity = current rent + renter extras - annual maintenance/12 - owner extras. Invert the amortization formula for the chosen term, then add the down payment. Buying fees and initial renovation require separate upfront cash. If owner costs exceed the budget, no affordable purchase is asserted.
- Renovation assumes an already-owned home without another mortgage. Borrowed amount = repair cost - repair cash. Repair loan starts immediately; rent continues for the selected whole number of months. Owner costs start after moving. The after-move monthly comparison uses today's recurring-cost levels and excludes a loan payment if it is already paid off by the move date.
- Renovation recovery is the first month after moving when cumulative avoided rent, net of ongoing owner costs, covers the entire repair and all contractual loan interest. Implementation compares cumulative rental cash with renovation cash paid plus all remaining scheduled repair-loan payments. Therefore an unpaid loan cannot create a false early recovery. Recovery is reported only within the selected horizon, separately from loan maturity.
- Rent and recurring costs grow at annual boundaries if enabled. Values shown are cash amounts at their respective dates, without purchasing-power conversion. Identical utilities cancel out. Refundable deposits, investment returns, property appreciation, exchange rates, variable rates and income interruptions are excluded.

## Files
- `src/lib/buy-rent.js`: model, limits and defaults.
- `src/lib/buy-rent-copy.js`: RO/RU/EN copy and SEO metadata.
- `src/components/BuyRentSimulator.js`, `BuyRentEstimateAction.js`.
- `src/app/cumparare-sau-chirie/`: page, layout and styles.

Tests/build/browser checks were skipped at the user's request. No server was started.

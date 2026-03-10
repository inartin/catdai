# Price Adjustments

Post-calculation bonuses applied when the user provides balcony or bathroom counts. These fields are too sparse in the DB to use as comparable filters, so they adjust the final estimate instead.

Logic lives in `src/app/api/estimate/route.js` → `computeFeatureAdjustments()`. The SQL function is not touched.

## Adjustments

Baseline is what a typical Chișinău apartment has (1 balcony, 1 bathroom). Only deviations from baseline produce an adjustment.

| Feature | Count | Adjustment |
|---------|-------|-----------|
| Balconies | 0 | −2% |
| Balconies | 1 | baseline |
| Balconies | 2 | +2% |
| Balconies | 3+ | +3% |
| Bathrooms | 0 | −4% |
| Bathrooms | 1 | baseline |
| Bathrooms | 2 | +3% |
| Bathrooms | 3+ | +5% |

Adjustments are additive. Max combined: +8% (3+ balconies + 3+ bathrooms).

## Sources

Calibrated conservatively from Eastern-European appraisal standards (AFOS 2021) and hedonic regression data — roughly half of Western-market benchmarks, which don't reflect Moldova's price sensitivity.

## What gets adjusted

`estimate.fast_sale`, `market_rate`, `premium`, `price_per_m2` — all multiplied by `1 + totalPct / 100` and re-rounded to nearest €100.

`range` and `market_stats` are **not** adjusted — they always reflect raw comparable data.

## Future

Replace static coefficients with locally-derived hedonic regression once the DB has sufficient listings with balcony/bathroom data.

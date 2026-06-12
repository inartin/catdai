# Rent Yield Calculator

## Stage
Implemented for rent-yield calculations.

## Route
- `/calculator` shows the starting form.
- Submitting the form keeps the same route and appends `rezultat=1` plus the selected criteria in the query string.
- Result URLs stay on `/calculator?rezultat=1...`.
- Result mode calls `/api/estimate-rent` with the property criteria, then applies calculator-only investment fields after the rent estimate returns.

## Form
- Reuses `PropertyForm` with the `rentYieldCalculator` variant.
- Keeps cadastral quick fill, location, property details, and optional property details from the estimate flow.
- Adds investment fields: apartment price, optional additional investments, and an optional official 7% monthly rent tax checkbox.
- The rent tax checkbox is labeled `Include impozitul pe chirie de 7%` in Romanian.
- Apartment price, additional investments, and rent tax are not sent to the rent-estimate API; they are used only for yield and payback calculations.
- The calculator variant hides the sale/rent tabs, estimate accuracy meter, and 999.md prompt.
- On `/calculator` only, the form uses separate cards ordered as investment, quick fill plus location, and `Despre Proprietate`. The regular estimator keeps the original single divided card.
- In the location card, the card header appears first, followed by a centered compact optional cadastral quick-fill block and then the full-width city/sector fields.
- The compact cadastral quick-fill block uses the shared `CadastralQuickSearchCard` component and presents the cadastral number as an optional shortcut collapsed by default; expanding it shows the input and search button.
- Calculator optional property details do not show the sale-specific first-floor and last-floor checkboxes.
- The calculator page header uses a calculator icon instead of the estimate form's house icon.
- Sector/zone fields no longer use fade-in animation, preventing animation replay during normal typing or checkbox changes.

## Result
- Reuses the rent result layout from `EstimateResult`.
- The calculator result top card removes the lowest/highest rent listing columns.
- `Preț Chirie Recomandată` is shown on the left only for the calculator result.
- On mobile calculator results, the top rent-analysis card hides the renovation/building/floor/bathroom badges to keep the header compact.
- The left side of the calculator result separates monthly rent and annual rent into two prominent stacked values, labeled only `pe lună` and `pe an`.
- On mobile, each calculator result section places its two values side by side with smaller mobile-only number sizing, so monthly and annual values fit on one row per section.
- Calculator result metric cells use fixed label, value, and helper-text rows so values align across neighboring mobile cells even when one label wraps or one helper line is absent.
- `Preț Chirie Recomandată` can be edited from the result card; changing it recalculates annual rent, tax, yield, and payback locally without refetching the rent estimate.
- On desktop, the recommended-rent value exposes its editable state on hover/focus. On mobile, editing shows a compact `OK` confirmation button beside the input.
- When tax is selected, a center green-tinted block shows the monthly and annual rent after tax with the same prominent number style.
- The middle net monthly and net annual numbers use the largest result size; left and right block numbers use the slightly smaller prominent size.
- Calculator result columns use equal widths on desktop.
- Calculator result cells keep fixed minimum heights, so toggling tax does not change the block height.
- A compact switch-style control above the calculator result lets the user instantly switch the calculation with or without the 7% official rent tax, without refetching the rent estimate.
- The after-tax monthly value shows the deducted tax as `-7% (€29) impozit` above the value, and uses `net lunar` / `net anual` labels.
- When tax is enabled, a tax summary block below the main numbers is split into monthly, annual, and estimated total tax paid by the end of the payback period.
- Below the tax summary, a yearly accumulation chart shows cumulative net rental income and cumulative tax paid with vertical lines through the final payback year, includes amount and `Ani de chirie` axes, and exposes per-year values on hover/focus.
- The right side shows `Randament anual brut` and `Perioadă de recuperare` as two stacked prominent values.
- Total investment is `apartment_price + additional_investments`.
- Annual gross yield is based on the estimated monthly rent from `estimate.market_rate`.
- When selected, the 7% rent tax is calculated monthly from estimated rent and deducted for after-tax yield and payback period.
- The calculator does not treat 7% as a target yield.
- The old `Alternative mai bune` explanatory text block is not shown on the calculator result.
- The form and result page both end with the reusable info block `Cum funcționează calculul`, explaining that monthly rent is estimated from similar listings and then annual yield, net after-tax income, and estimated payback period are calculated.

## Analytics
- `/calculator?rezultat=1` sends a calculator usage payload with device/session ids, selected investment fields, tax selection, and language to `/api/estimate-rent`.
- Calculator usage is stored in `calculator_usage_events` when `NODE_ENV=production` or `ENABLE_RUNTIME_PERSISTENCE=true`.
- Logged rows include anonymous or authenticated user id, property filters, investment totals, estimated monthly rent, gross/effective yield, payback period, and timestamp.
- A stable per-result `event_id` prevents duplicate rows for the same browser session/result URL.
- Admin dashboard shows calculator usage totals, recent rows, period totals, registered/anonymous split, tax-enabled count, and average investment/rent/yield.

## Related Files
- `src/app/calculator/page.js`
- `src/app/calculator/layout.js`
- `src/lib/calculator-usage-events.js`
- `src/components/PropertyForm.js`
- `src/components/InfoCallout.js`
- `src/components/CadastralQuickSearchCard.js`
- `src/locales/ro.json`
- `src/locales/ru.json`
- `db/calculator_usage_events.sql`

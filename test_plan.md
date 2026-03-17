1. **Create `components/CurrencyInput.tsx`:**
   - I will create a new React component that acts as a wrapper around an `input` element.
   - It will take a `value` (number) and `onChange` (function to update the number) props.
   - Internally, it will manage a `displayValue` state string. When the user types, it removes non-digit characters, calculates the actual number by dividing by 100, and formats the result as a Brazilian Real currency string (e.g., "20.000,00").
   - This ensures the input is always nicely formatted as they type, without needing them to manually enter dots or commas.

2. **Update `views/Routes.tsx`:**
   - I will replace the regular `<input type="number">` fields for `saleValue` and `quoteValue` with the new `<CurrencyInput>` component.

3. **Update `views/Quotes.tsx`:**
   - I will also replace the `<input type="number">` field for the new quote's `value` with the new `<CurrencyInput>` component.

4. **Complete Pre-Commit Steps:**
   - Ensure proper testing, verification, review, and reflection are done.

5. **Submit Change:**
   - Commit the changes and push to the branch.

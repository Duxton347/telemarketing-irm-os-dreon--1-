import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        await page.goto("http://localhost:3001/")
        await page.evaluate("""
            window.localStorage.setItem('dreon_user', JSON.stringify({
                id: '1',
                name: 'Admin',
                role: 'ADMIN',
                email: 'admin@test.com'
            }));
        """)

        await page.reload()
        await page.goto("http://localhost:3001/#/quotes")

        await page.wait_for_selector("text=Novo Orçamento", timeout=10000)
        await page.click("text=Novo Orçamento")

        # Wait for the modal to be visible
        await page.wait_for_selector("text=NOVO ORÇAMENTO")

        # Select the CurrencyInput next to "Valor (R$)" label
        input_locator = page.locator('xpath=//label[text()="Valor (R$)"]/following-sibling::input')

        await input_locator.wait_for(state="visible", timeout=10000)

        # Type the value as requested by the user: "2000000" should become "20.000,00"
        await input_locator.type("2000000", delay=50)

        # Let's take a screenshot to verify the formatting
        await asyncio.sleep(1)
        await page.screenshot(path="/app/currency_input_success.png")
        print("Screenshot of successful input saved to /app/currency_input_success.png")

        # Verify the value in the input
        val = await input_locator.input_value()
        print(f"Value in input is: {val}")
        if val == "20.000,00":
            print("SUCCESS: The input is correctly formatted.")
        else:
            print("FAILURE: The input formatting is incorrect.")

        await browser.close()

asyncio.run(main())

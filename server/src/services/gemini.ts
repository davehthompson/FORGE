import { GoogleGenAI } from '@google/genai';

const SCENE_PROMPTS: Record<string, string> = {
  restaurant_table:
    'a warm-toned wooden restaurant table surface. Nothing else on the table — just the receipt on the bare wood. Warm ambient lighting.',
  bar_counter:
    'a dark polished bar counter top surface. Nothing else on the counter — just the receipt on the bare surface. Dim warm lighting.',
  desk:
    'a clean office desk surface. Nothing else on the desk — just the receipt on the bare surface. Neutral daylight.',
  counter:
    'a retail checkout counter surface. Nothing else on the counter — just the receipt on the bare surface. Bright overhead lighting.',
  cafe_table:
    'a small round marble café table surface. Nothing else on the table — just the receipt on the bare marble. Soft morning light.',
};

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please add your Gemini API key to the .env file.');
  }
  return new GoogleGenAI({ apiKey });
}

function buildReceiptImagePrompt(userPrompt: string, scene: string): string {
  const sceneDescription = SCENE_PROMPTS[scene] || SCENE_PROMPTS['restaurant_table'];

  return `Generate a photorealistic photograph of a thermal paper receipt sitting on ${sceneDescription}

The receipt must show a REAL, COMPLETE transaction based on this description: "${userPrompt}"

RECEIPT REQUIREMENTS:
- Printed on narrow white thermal paper (approximately 3 inches wide)
- Monospaced or dot-matrix style black text typical of a real POS thermal printer
- Include ALL of these sections from top to bottom:
  * Store/restaurant name and address at the top (centered, larger text)
  * Date and time of transaction
  * Server or cashier name, table number if restaurant
  * Itemized list with quantities, item names, and prices (right-aligned prices)
  * Subtotal line
  * Tax line with rate and amount
  * Tip line (with handwritten-looking tip amount if restaurant)
  * Total line (bold/larger)
  * Payment method (e.g. VISA ending in XXXX, APPROVED)
  * Authorization code
  * A "Thank You" message or survey URL at the bottom
  * A barcode at the very bottom

PHOTOREALISM REQUIREMENTS:
- The paper should have slightly curled edges and a natural slight curl/wave — not perfectly flat
- The thermal print should have that characteristic slightly faded, warm-black tone
- The receipt should cast a subtle natural shadow on the surface
- Shot from directly overhead, straight top-down perspective — as if someone is holding their phone flat above the receipt to photograph it for an expense report
- Shallow depth of field — the receipt text is sharp and readable while the background is softly blurred
- Natural, non-studio lighting consistent with the scene
- The receipt should look like it was just placed down — not pristine, not destroyed

DATA AUTHENTICITY REQUIREMENTS — THIS IS CRITICAL:
- Use a REAL address for an actual location of the vendor/store mentioned. Look up the real street address, city, state, and zip code. NEVER use placeholder addresses like "123 Main St" or "Anytown".
- Use a REAL phone number for that specific location.
- Use the CORRECT local sales tax rate for that city/state (e.g. 6.25% in MA, 8.875% in NYC, 10.25% in Chicago).
- Use REAL menu items or products that the vendor actually sells, at realistic current prices. For example, Dunkin' actually sells "Med Hot Coffee" not "COFFEE MED". Match the vendor's real naming conventions.
- Use a recent date within the last week. Use today's actual year.
- Match the vendor's REAL receipt formatting style. Different chains format their receipts differently — Starbucks receipts look different from Olive Garden receipts. Use the correct branding, logo text, and layout conventions for that specific vendor.
- Generate realistic transaction details: a plausible 6-digit auth code, a realistic last-4 card number, a real-looking transaction/receipt number format for that vendor.
- If the vendor has a known customer survey URL (e.g. "telldunkin.com", "www.tellthebell.com"), loyalty program, or rewards points — include it on the receipt.
- Store number and register/terminal number should look realistic for the chain.

All text on the receipt must be LEGIBLE and sharp enough to read. Every word, number, and price must be clearly rendered.

IMPORTANT: This should look exactly like a real photo someone would take of their receipt for an expense report. Not an illustration, not a render — a photograph.`;
}

export async function generateReceiptImage(
  userPrompt: string,
  scene: string = 'restaurant_table'
): Promise<{ imageBuffer: Buffer; mimeType: string }> {
  const client = getGeminiClient();
  const prompt = buildReceiptImagePrompt(userPrompt, scene);

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: prompt,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  if (!response.candidates || response.candidates.length === 0) {
    throw new Error('No response from Gemini model');
  }

  const parts = response.candidates[0].content?.parts;
  if (!parts) {
    throw new Error('No content parts in Gemini response');
  }

  for (const part of parts) {
    if (part.inlineData?.data) {
      const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
      const mimeType = part.inlineData.mimeType || 'image/png';
      return { imageBuffer, mimeType };
    }
  }

  throw new Error('No image generated by Gemini. The model returned text only. Try a more descriptive prompt.');
}

export const AVAILABLE_SCENES = Object.keys(SCENE_PROMPTS);

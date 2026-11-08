import { NextResponse } from 'next/server';
import type { BuildAIConcept, ConceptColor } from '@/lib/types';
import { parseLooseJson, readAssistantText, repairJsonWithDeepSeek } from '@/lib/ai-json';

export const runtime = 'nodejs';
export const maxDuration = 27;

const fallbackPalette: ConceptColor[] = [
  { name: 'Минерално бяло', hex: '#E8E6DE' },
  { name: 'Графит', hex: '#35444A' },
  { name: 'Акцент', hex: '#B8D867' },
];

function getErrorMessage(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: { message?: string } | string }).error;
    if (typeof error === 'string') return error;
    if (error && typeof error.message === 'string') return error.message;
  }
  return 'AI услугата върна грешка.';
}

function cleanConcept(raw: unknown): BuildAIConcept | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<BuildAIConcept>;
  if (typeof value.description !== 'string') return null;
  const palette = Array.isArray(value.palette)
    ? value.palette.slice(0, 5).flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const color = item as Partial<ConceptColor>;
      if (typeof color.name !== 'string' || typeof color.hex !== 'string') return [];
      const hex = color.hex.match(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i)?.[0];
      return hex ? [{ name: color.name.slice(0, 48), hex }] : [];
    })
    : [];
  const asTextList = (items: unknown, max = 8) => Array.isArray(items)
    ? items.filter((item): item is string => typeof item === 'string').slice(0, max).map(item => item.slice(0, 240))
    : [];

  return {
    title: typeof value.title === 'string' ? value.title.slice(0, 100) : 'Концепция за обновяване',
    style: typeof value.style === 'string' ? value.style.slice(0, 100) : 'Съвременен, функционален стил',
    description: value.description.slice(0, 1200),
    palette: palette.length ? palette : fallbackPalette,
    improvements: asTextList(value.improvements, 8),
    materials: asTextList(value.materials, 8),
    designNotes: asTextList(value.designNotes, 6),
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Липсва DEEPSEEK_API_KEY. Добави го като secret / server-side environment variable в Kuso.' },
      { status: 503 },
    );
  }

  try {
    const form = await request.formData();
    const file = form.get('image');
    const instruction = String(form.get('instruction') || 'Предложи реалистична, практична концепция за обновяване.');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Качи оригиналната снимка отново.' }, { status: 400 });
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: 'Използвай JPG, PNG или WebP изображение до 8 MB.' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${bytes.toString('base64')}`;
    const model = process.env.DEEPSEEK_VISION_MODEL || 'deepseek-flash';
    const prompt = `Създай дизайнерска концепция за обновяване по снимката. Цел/насока: ${instruction}
Върни само валиден JSON, без Markdown, със структура:
{
  "title": "кратко заглавие на български",
  "style": "стил на концепцията на български",
  "description": "обяснение на основната визуална идея на български",
  "palette": [{"name":"име на цвят на български","hex":"#AABBCC"}],
  "improvements": ["конкретно видимо/изпълнимо предложение"],
  "materials": ["възможен материал или покритие"],
  "designNotes": ["важна бележка или допускане"]
}
Използвай 3-5 цвята и до 8 предложения. Шестцифрен hex код за цветовете. Предложенията трябва да се отнасят към реалното пространство от снимката, да са приложими и да запазват общата му идентичност. Не измисляй размери, конструктивни данни или точни цени. Не представяй резултата като истински измерен CAD/BIM файл или готов архитектурен проект. Това приложение визуализира концепцията като интерактивен 3D-подобен макет, а не като генерирано фотореалистично изображение.`;

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Ти си опитен концептуален архитектурен дизайнер. Работи само с видими белези и ясно отбелязвай предположенията.' },
          { role: 'user', content: [
            { type: 'text', text: `${prompt}\nНе връщай изображение или Markdown. Върни JSON.` },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
          ] },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1400,
        temperature: 0.25,
        stream: false,
      }),
      signal: AbortSignal.timeout(22000),
    });

    const upstreamBody = await upstream.text();
    let payload: unknown = null;
    try { payload = JSON.parse(upstreamBody); } catch { payload = { error: { message: upstreamBody.slice(0, 300) } }; }
    if (!upstream.ok) {
      const providerMessage = getErrorMessage(payload);
      console.error('DeepSeek concept error:', upstream.status, providerMessage.slice(0, 500));
      let friendly = `DeepSeek отказа заявката (HTTP ${upstream.status}). `;
      if (upstream.status === 401) friendly += 'Провери дали DEEPSEEK_API_KEY е правилен.';
      else if (upstream.status === 402) friendly += 'Няма наличен API баланс. Провери акаунта си в DeepSeek.';
      else if (upstream.status === 429) friendly += 'Достигнат е лимитът на заявките. Изчакай малко и опитай отново.';
      else if (upstream.status === 400 || upstream.status === 422) friendly += 'Провери модела и формата на заявката в deployment настройките.';
      else friendly += 'Възможно е услугата да е натоварена. Изчакай малко и опитай отново.';
      return NextResponse.json({ error: friendly, providerStatus: upstream.status }, { status: 502 });
    }

    const outputText = readAssistantText(payload);
    if (!outputText) {
      return NextResponse.json({ error: 'DeepSeek не върна концепция. Опитай отново.' }, { status: 502 });
    }

    const expectedShape = `{
  "title": "кратко заглавие на български",
  "style": "стил на концепцията",
  "description": "обяснение на идеята",
  "palette": [{"name":"име на цвят","hex":"#AABBCC"}],
  "improvements": ["предложение"],
  "materials": ["материал"],
  "designNotes": ["важна бележка"]
}`;
    let parsed: unknown = parseLooseJson(outputText);
    let concept = cleanConcept(parsed);
    if (!concept) {
      console.warn('DeepSeek concept did not match the expected JSON schema; trying JSON repair.');
      parsed = await repairJsonWithDeepSeek({
        apiKey,
        model,
        rawText: outputText,
        expectedShape,
        timeoutMs: 3500,
      });
      concept = cleanConcept(parsed);
    }
    if (!concept) {
      console.error('Could not recover a valid BuildAI concept. Raw response prefix:', outputText.slice(0, 700));
      return NextResponse.json({ error: 'DeepSeek върна концепция в непознат формат. Опитай отново; не е необходимо да качваш снимката наново.' }, { status: 502 });
    }
    return NextResponse.json({ concept });
  } catch (error) {
    console.error('DeepSeek concept route error:', error);
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return NextResponse.json({ error: 'DeepSeek не завърши концепцията в рамките на 22 секунди. Опитай отново след малко.' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Възникна проблем при връзката с DeepSeek. Провери deployment логовете в Kuso.' }, { status: 502 });
  }
}

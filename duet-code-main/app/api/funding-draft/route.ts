import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

function clean(value: unknown, max = 2500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const description = clean(payload.description);
    const applicant = clean(payload.applicant, 250) || 'За попълване';
    const region = clean(payload.region, 160) || 'България';
    const budget = clean(payload.budget, 120) || 'Не е определен';
    const call = payload.call && typeof payload.call === 'object' ? payload.call as Record<string, unknown> : {};
    const callTitle = clean(call.title, 400) || 'Не е избрана конкретна покана';
    const callIdentifier = clean(call.identifier, 220) || 'Не е определен';
    const callStatus = clean(call.status, 160) || 'Не е потвърден';
    const callDeadline = clean(call.deadline, 120) || 'Да се провери';
    const callUrl = clean(call.url, 700) || 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/';
    if (description.length < 15) return NextResponse.json({ error: 'Опиши проекта по-подробно, преди да генерираш проектното досие.' }, { status: 400 });

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Липсва DEEPSEEK_API_KEY. Може да се генерира шаблон, но за пълния AI текст добави ключ в Kuso.' }, { status: 503 });

    const model = process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-flash';
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `Изготви съдържателен ПЪРВОНАЧАЛЕН ПРОЕКТЕН ПАКЕТ за потенциално кандидатстване за финансиране от ЕС. Отговори само на български в нормален текст с ясни заглавия, без JSON/Markdown таблици. Включи: 1) кратко резюме; 2) проблем и обосновка; 3) обща и специфични цели; 4) дейности по работни пакети и резултати; 5) целеви групи и бенефициенти; 6) измерими индикатори (използвай [за попълване], ако няма база за стойност); 7) ориентировъчен график по етапи; 8) бюджетна структура като категории, без да измисляш точни допустими разходи или финансиращи проценти; 9) устойчивост; 10) рискове и мерки; 11) роли на кандидата и партньорите; 12) списък на приложения и документи; 13) контролен списък преди подаване. Не измисляй факти за кандидата, проектното място, собствеността, разрешителните, статистиката, офертите или официалните правила. Използвай [за попълване] при липсваща информация. Не казвай, че това е официално заявление или че е подадено. Посоченият идентификатор е от търсачка и не доказва допустимост. Изрично добави, че официален номер на заявление се получава от портала едва при реално подаване. Ако поканата е насочена към изследвания/иновации, не я представяй като директна субсидия за обикновен ремонт.`
          },
          {
            role: 'user',
            content: `Описание на проекта: ${description}\nКандидат: ${applicant}\nРегион: ${region}\nБюджет: ${budget}\n\nПокана от официалната търсачка:\nНаименование: ${callTitle}\nИдентификатор: ${callIdentifier}\nСтатус от търсачката: ${callStatus}\nКраен срок/информация: ${callDeadline}\nОфициална страница: ${callUrl}\n\nПодготви подробно работно проектно досие с полета за липсващите факти. Не прави предположения като че ли са факти.`
          },
        ],
        temperature: 0.25,
        max_tokens: 2300,
        stream: false,
      }),
      signal: AbortSignal.timeout(12500),
    });
    const raw = await response.text();
    let result: unknown;
    try { result = JSON.parse(raw); } catch { return NextResponse.json({ error: 'DeepSeek върна невалиден отговор при генериране на досието.' }, { status: 502 }); }
    if (!response.ok) {
      let message = 'DeepSeek не успя да генерира проектния текст.';
      if (result && typeof result === 'object' && 'error' in result) {
        const error = (result as { error?: { message?: string } | string }).error;
        if (typeof error === 'string') message = error;
        else if (error && typeof error.message === 'string') message = error.message;
      }
      const friendly = response.status === 401 ? 'Провери DEEPSEEK_API_KEY в Kuso.' : response.status === 402 ? 'Няма наличен API баланс.' : response.status === 429 ? 'Достигнат е лимитът на DeepSeek.' : message;
      return NextResponse.json({ error: friendly }, { status: 502 });
    }
    const draft = result && typeof result === 'object' && 'choices' in result
      ? (result as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]?.message?.content
      : '';
    if (typeof draft !== 'string' || !draft.trim()) return NextResponse.json({ error: 'DeepSeek не върна текст за проектното досие.' }, { status: 502 });
    return NextResponse.json({ draft: draft.trim().slice(0, 24000), generatedByAI: true });
  } catch (error) {
    console.error('BuildAI funding-draft route error:', error);
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return NextResponse.json({ error: timedOut ? 'Генерирането отне твърде дълго. Опитай отново.' : 'Неуспешно генериране на проектното досие.' }, { status: 502 });
  }
}

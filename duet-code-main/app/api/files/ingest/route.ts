import { NextResponse } from 'next/server';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import ExcelJS from 'exceljs';
import { strFromU8, unzipSync } from 'fflate';

export const runtime = 'nodejs';
export const maxDuration = 20;

const MAX_FILES = 10;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_CHARS = 28000;
const supportedExtensions = new Set(['pdf','docx','xlsx','csv','txt','md','json','pptx','html','htm','rtf','xml','log','yaml','yml','toml','ini','sql','py','js','ts','tsx','jsx','css','java','cs','php','sh']);

function decodeHtmlEntities(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code))).replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function xmlToText(xml: string): string {
  return decodeHtmlEntities(xml.replace(/<a:br\s*\/?\s*>/gi, '\n').replace(/<\/a:p>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim());
}

async function extractFileText(fileName: string, buffer: Buffer): Promise<string> {
  const extension = fileName.toLowerCase().split('.').pop() || '';
  if (['txt', 'md', 'csv', 'json', 'xml', 'html', 'htm', 'rtf', 'log', 'yaml', 'yml', 'toml', 'ini', 'sql', 'py', 'js', 'ts', 'tsx', 'jsx', 'css', 'java', 'cs', 'php', 'sh'].includes(extension)) {
    let text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    if (extension === 'html' || extension === 'htm' || extension === 'xml') text = xmlToText(text);
    if (extension === 'rtf') text = text.replace(/\\'[\da-f]{2}/gi, '').replace(/\\[a-z]+-?\d* ?/gi, ' ').replace(/[{}]/g, ' ').replace(/\\par\b/g, '\n');
    return text;
  }
  if (extension === 'pdf') {
    const parsed = await pdfParse(buffer);
    return typeof parsed.text === 'string' ? parsed.text : '';
  }
  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }
  if (extension === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const blocks: string[] = [];
    for (const sheet of workbook.worksheets) {
      blocks.push(`Лист: ${sheet.name}`);
      sheet.eachRow({ includeEmpty: false }, row => {
        const values = row.values as unknown[];
        blocks.push(values.slice(1).map(value => {
          if (value === null || value === undefined) return '';
          if (typeof value === 'object' && value && 'text' in value) return String((value as { text?: unknown }).text ?? '');
          if (typeof value === 'object' && value && 'result' in value) return String((value as { result?: unknown }).result ?? '');
          return String(value);
        }).join('\t'));
      });
      blocks.push('');
    }
    return blocks.join('\n');
  }
  if (extension === 'pptx') {
    const archive = unzipSync(new Uint8Array(buffer));
    const slidePaths = Object.keys(archive).filter(path => /^ppt\/slides\/slide\d+\.xml$/i.test(path)).sort((a, b) => {
      const first = Number(a.match(/slide(\d+)/i)?.[1] || 0);
      const second = Number(b.match(/slide(\d+)/i)?.[1] || 0);
      return first - second;
    });
    return slidePaths.map((path, index) => `Слайд ${index + 1}:\n${xmlToText(strFromU8(archive[path]))}`).join('\n\n');
  }
  throw new Error(`Формат .${extension} не се поддържа за извличане на текст.`);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll('files').filter((value): value is File => value instanceof File);
    if (!files.length) return NextResponse.json({ error: 'Избери поне един документ за обработка.' }, { status: 400 });
    if (files.length > MAX_FILES) return NextResponse.json({ error: `Можеш да обработиш до ${MAX_FILES} файла наведнъж.` }, { status: 400 });

    let charsLeft = MAX_TOTAL_CHARS;
    const documents: { name: string; extension: string; text: string; characters: number }[] = [];
    const errors: { name: string; error: string }[] = [];
    let totalBytes = 0;

    for (const file of files) {
      const extension = file.name.toLowerCase().split('.').pop() || '';
      totalBytes += file.size;
      if (file.size > MAX_FILE_BYTES) { errors.push({ name: file.name, error: 'Файлът надвишава лимита от 15 MB.' }); continue; }
      if (!supportedExtensions.has(extension)) { errors.push({ name: file.name, error: `Форматът .${extension} не се поддържа за текстово извличане.` }); continue; }
      if (totalBytes > 40 * 1024 * 1024) { errors.push({ name: file.name, error: 'Общият размер на качването е над 40 MB.' }); break; }
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const extracted = (await extractFileText(file.name, buffer)).replace(/\u0000/g, '').trim();
        const text = extracted.slice(0, Math.max(0, charsLeft));
        charsLeft -= text.length;
        documents.push({ name: file.name, extension, text, characters: text.length });
      } catch (error) {
        errors.push({ name: file.name, error: error instanceof Error ? error.message.slice(0, 300) : 'Неуспешно разчитане на файла.' });
      }
    }
    if (!documents.length) return NextResponse.json({ error: 'Не успях да извлека текст от избраните документи. Провери формата и логовете.', files: errors }, { status: 422 });

    const combinedContext = documents.filter(doc => doc.text).map(doc => `--- ФАЙЛ: ${doc.name} ---\n${doc.text}`).join('\n\n').slice(0, MAX_TOTAL_CHARS);
    return NextResponse.json({
      documents: documents.map(({ name, extension, characters }) => ({ name, extension, characters })),
      context: combinedContext,
      errors,
      totalCharacters: combinedContext.length,
      truncated: charsLeft <= 0,
    });
  } catch (error) {
    console.error('BuildAI file ingestion failed:', error);
    return NextResponse.json({ error: 'Неуспешна обработка на файловете. Опитай с по-малко файлове или по-малки документи.' }, { status: 500 });
  }
}

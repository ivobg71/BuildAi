import type { Metadata } from 'next';
import Home from '../page';

export const metadata: Metadata = {
  title: 'BuildAI — нов проект',
  description: 'Създай нов строителен проект с AI анализ, бюджет, материали, изпълнители и архитектурен план.',
};

export default function NewProjectPage() {
  return <Home initialView="create" />;
}

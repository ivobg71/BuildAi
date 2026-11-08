'use client';

import { useEffect, useRef, useState } from 'react';
import { Archive, ArrowRight, CalendarClock, CheckCircle2, Download, FileText, FolderOpen, LoaderCircle, MapPin, Plus, Trash2, Wallet } from 'lucide-react';
import { calculateEstimateTotals, deleteProject, exportProjectBackup, importProjectBackup, listProjects, saveProject, type SavedProject } from '@/lib/project-store';

type Props = {
  refreshToken: number;
  onSelect: (project: SavedProject) => void;
  onNew: () => void;
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('bg-BG', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ProjectManager({ refreshToken, onSelect, onNew }: Props) {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    setError('');
    try { setProjects(await listProjects()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Не успях да заредя проектите.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [refreshToken]);

  async function remove(project: SavedProject) {
    if (!window.confirm(`Да изтрия ли локалния проект „${project.name || project.number}“? Това не може да се отмени.`)) return;
    try { await deleteProject(project.id); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Не успях да изтрия проекта.'); }
  }

  async function downloadBackup(project: SavedProject) {
    try {
      setError(''); setNotice('Подготвям резервно копие с всички прикачени файлове…');
      const content = await exportProjectBackup(project);
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${(project.number || 'buildai-project').replace(/[^a-z0-9-]/gi, '_')}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Резервното копие е готово. Включени са приложенията и запазените данни на проекта.');
    } catch (caught) {
      setNotice(''); setError(caught instanceof Error ? caught.message : 'Не успях да създам резервно копие.');
    }
  }

  async function importBackup(file?: File) {
    if (!file) return;
    setError(''); setNotice('Импортирам проекта и прикачените файлове…');
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('Резервното копие е над 100 MB.');
      const { project, missingAttachments } = await importProjectBackup(await file.text());
      await saveProject(project);
      await refresh();
      onSelect(project);
      setNotice(missingAttachments ? `Проектът е импортиран, но ${missingAttachments} стари прикачени файла не съдържаха данни и не могат да бъдат възстановени.` : `Проектът „${project.name}“ и файловете са възстановени успешно.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не успях да импортирам проекта.'); setNotice('');
    }
  }

  return <section className="projects-page">
    <header className="projects-page-heading">
      <div><div className="eyebrow"><FolderOpen size={14} /> BUILDAI · ПРОЕКТЕН АРХИВ</div><h1>Моите строителни проекти</h1><p>Проектите се запазват автоматично в този браузър. Резервното копие пренася основните данни, прикачените файлове, сметката, финансирането и свързаните 3D модели.</p></div>
      <button type="button" className="primary-button" onClick={onNew}><Plus size={16} /> Нов проект</button>
    </header>
    <div className="project-archive-toolbar"><button type="button" className="secondary-button" onClick={() => importInputRef.current?.click()}><FolderOpen size={15} /> Импортирай резервно копие</button><input ref={importInputRef} type="file" accept="application/json,.json" className="visually-hidden" onChange={event => { const picked = event.currentTarget.files?.[0]; void importBackup(picked); event.currentTarget.value = ''; }} /><span>Архивът включва и прикачените файлове.</span></div>
    {error && <div className="error-message">{error}</div>}
    {notice && <div className="project-archive-notice">{notice}</div>}
    {loading ? <div className="projects-empty"><LoaderCircle className="spin" size={24} /><span>Зареждам проектите…</span></div> : projects.length === 0 ? <div className="projects-empty"><span className="projects-empty-icon"><Archive size={28} /></span><h2>Все още няма запазени проекти</h2><p>Започни нов проект. Промените ще се пазят автоматично, докато работиш.</p><button className="primary-button" onClick={onNew}><Plus size={16} /> Създай първия проект</button></div> : <div className="projects-grid">
      {projects.map(project => {
        const doneTasks = Object.values(project.taskStatuses || {}).filter(status => status === 'done').length;
        const totalTasks = project.analysis?.actionPlan?.length || 0;
        const estimateTotal = project.estimate ? calculateEstimateTotals(project.estimate).grand : null;
        return <article className="project-card" key={project.id}>
          <div className="project-card-top"><span className={`project-stage-pill ${project.stage === 'planned' ? 'ready' : ''}`}>{project.stage === 'planned' ? <CheckCircle2 size={13} /> : <FileText size={13} />}{project.stage === 'planned' ? 'Има план' : 'Чернова'}</span><small><CalendarClock size={12} /> {formatDate(project.updatedAt)}</small></div>
          <h2>{project.name || 'Без име'}</h2><div className="project-number">{project.number}</div>
          <p className="project-card-description">{project.goal || project.analysis?.summary || 'Добави описание, снимки и документи, за да започнеш.'}</p>
          <div className="project-card-meta"><span><MapPin size={13} /> {project.address || project.region || 'Без местоположение'}</span><span><FileText size={13} /> {project.attachments?.length || 0} файла</span><span><CheckCircle2 size={13} /> {doneTasks}/{totalTasks} задачи</span>{estimateTotal != null && <span><Wallet size={13} /> {estimateTotal.toLocaleString('bg-BG', { maximumFractionDigits: 2 })} € ориентир</span>}<span><Archive size={13} /> {project.modelReports?.length || 0} 3D модела</span></div>
          <div className="project-card-actions"><button type="button" className="primary-button" onClick={() => onSelect(project)}><FolderOpen size={15} /> Отвори проекта <ArrowRight size={14} /></button><button type="button" className="secondary-button" onClick={() => void downloadBackup(project)} aria-label="Изтегли резервно копие" title="Изтегли резервно копие"><Download size={15} /> JSON</button><button type="button" className="project-delete-button" onClick={() => void remove(project)} title="Изтрий проекта" aria-label="Изтрий проекта"><Trash2 size={15} /></button></div>
        </article>;
      })}
    </div>}
    <p className="projects-storage-note">Локално съхранение с IndexedDB. Данните не се синхронизират автоматично между различни устройства или браузъри. Използвай JSON резервно копие за пренасяне на основните данни; файловите прикачени материали остават в локалната база.</p>
  </section>;
}

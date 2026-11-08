'use client';

import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Box, Check, Download, Eye, RotateCcw, RotateCw, Scan, Sparkles } from 'lucide-react';
import type { AssetType, BuildAIConcept } from '@/lib/types';

type ProjectViewerProps = {
  image: string;
  assetType: AssetType;
  concept: BuildAIConcept;
  onDownload: () => void;
};

export default function ProjectViewer({ image, assetType, concept, onDownload }: ProjectViewerProps) {
  const [mode, setMode] = useState<'image' | '3d'>('3d');
  const [rotation, setRotation] = useState(-28);
  const [showGrid, setShowGrid] = useState(true);
  const dragRef = useRef<{ x: number; rotation: number } | null>(null);

  const sceneTitle = assetType === 'interior'
    ? 'Пространствена концепция на интериора'
    : assetType === 'public_space'
      ? 'Концептуален модел на обществена зона'
      : 'Обемен концептуален изглед на сградата';

  const palette = concept.palette?.length ? concept.palette : [
    { name: 'Минерално бяло', hex: '#E8E6DE' },
    { name: 'Графит', hex: '#35444A' },
    { name: 'Акцент', hex: '#B8D867' },
  ];
  const modelStyle = {
    '--model-side': palette[1]?.hex || '#35444A',
    '--model-top': palette[0]?.hex || '#E8E6DE',
    '--model-accent': palette[2]?.hex || '#B8D867',
  } as CSSProperties;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    dragRef.current = { x: event.clientX, rotation };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const delta = event.clientX - dragRef.current.x;
    setRotation(Math.max(-180, Math.min(180, dragRef.current.rotation + delta * 0.7)));
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  return (
    <section className="redesign-result project-viewer" aria-label="Концепция за обновяване">
      <div className="viewer-heading">
        <div>
          <div className="summary-title"><Box size={15} /> BUILD DESIGN STUDIO <span className="concept-status"><Check size={12} /> ГОТОВА КОНЦЕПЦИЯ</span></div>
          <h4>{concept.title || 'Концепция за обновяване'}</h4>
          <p className="viewer-style">{concept.style}</p>
        </div>
        <button type="button" className="text-button" onClick={onDownload}><Download size={14} /> Свали JSON</button>
      </div>

      <div className="viewer-toolbar" role="tablist" aria-label="Режим на визуализация">
        <button type="button" role="tab" aria-selected={mode === 'image'} className={`viewer-tab ${mode === 'image' ? 'active' : ''}`} onClick={() => setMode('image')}>
          <Scan size={15} /> Снимка и идея
        </button>
        <button type="button" role="tab" aria-selected={mode === '3d'} className={`viewer-tab ${mode === '3d' ? 'active' : ''}`} onClick={() => setMode('3d')}>
          <Box size={15} /> Интерактивен 3D
        </button>
      </div>

      {mode === 'image' ? (
        <div className="concept-image-layout">
          <div className="viewer-image-stage">
            <img src={image} alt="Оригинална снимка на обекта" />
            <span className="viewer-chip"><Eye size={13} /> ОРИГИНАЛНА СНИМКА</span>
          </div>
          <div className="concept-details">
            <span className="mini-label"><Sparkles size={13} /> ДИЗАЙНЕРСКА ПОСОКА</span>
            <p>{concept.description}</p>
            <div className="palette-list">
              {palette.map((color, index) => <div className="palette-swatch" key={`${color.hex}-${index}`} title={`${color.name} (${color.hex})`}><span style={{ background: color.hex }} /><small>{color.name}</small></div>)}
            </div>
            <h5>Предложени подобрения</h5>
            <ul className="concept-improvements">{concept.improvements.slice(0, 5).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
          </div>
        </div>
      ) : (
        <div className={`viewer-3d-stage ${showGrid ? 'with-grid' : ''} asset-${assetType}`}>
          <div className="viewer-stage-label"><span className="live-dot" /> ПРЕГЛЕД НА ПРОЕКТА <span className="stage-separator">/</span> 3D CONCEPT</div>
          <div
            className="model-perspective"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onLostPointerCapture={onPointerUp}
            title="Задръж и плъзни, за да завъртиш модела"
          >
            <div className={`concept-model ${assetType}`} style={{ ...modelStyle, transform: `rotateX(8deg) rotateY(${rotation}deg)` }}>
              <div className="model-face model-front"><img src={image} alt="Снимка върху предната страна на 3D концептуалния макет" draggable={false} /><span className="model-front-label">IMAGE SURFACE</span></div>
              <div className="model-face model-side"><span className="side-detail side-detail-one" /><span className="side-detail side-detail-two" /><span className="side-detail side-detail-three" /><span className="side-edge" /></div>
              <div className="model-face model-top"><span className="roof-accent" /></div>
              <div className="model-face model-back" />
              <div className="model-base"><span /><span /><span /></div>
            </div>
          </div>
          <div className="model-axis"><span>X</span><i /><span>Y</span><i /><span>Z</span></div>
          <div className="viewer-3d-caption">
            <div><strong>{sceneTitle}</strong><span>Плъзни модела с мишката или използвай контролите отдолу</span></div>
            <button type="button" className="grid-toggle" aria-pressed={showGrid} onClick={() => setShowGrid(value => !value)}><Scan size={14} /> {showGrid ? 'Скрий мрежата' : 'Покажи мрежата'}</button>
          </div>
          <div className="rotation-control">
            <button type="button" className="rotation-button" aria-label="Завърти наляво" onClick={() => setRotation(value => Math.max(-180, value - 12))}><RotateCcw size={16} /></button>
            <label htmlFor="model-rotation">Завъртане</label>
            <input id="model-rotation" type="range" min="-180" max="180" value={rotation} onChange={event => setRotation(Number(event.target.value))} />
            <button type="button" className="rotation-button" aria-label="Завърти надясно" onClick={() => setRotation(value => Math.min(180, value + 12))}><RotateCw size={16} /></button>
            <button type="button" className="rotation-button reset-rotation" aria-label="Нулирай изгледа" onClick={() => setRotation(-28)}>Нулирай</button>
          </div>
          <div className="model-palette"><span>ПАЛИТРА НА КОНЦЕПЦИЯТА</span>{palette.map((color, index) => <span className="model-color" key={`${color.hex}-${index}`} title={color.name} style={{ background: color.hex }} />)}</div>
          <p className="viewer-disclaimer">Това е интерактивен обемен макет с оригиналната снимка като текстура и цветове от концепцията. Не е измерен CAD/BIM модел и не показва проверена конструкция.</p>
        </div>
      )}

      <div className="concept-summary"><div className="concept-summary-icon"><Sparkles size={16} /></div><div><strong>Идея за обновяване</strong><p>{concept.description}</p></div></div>
      {concept.materials.length > 0 && <div className="material-tags"><span>ВЪЗМОЖНИ МАТЕРИАЛИ</span>{concept.materials.slice(0, 5).map((material, index) => <span className="material-tag" key={`${material}-${index}`}>{material}</span>)}</div>}
      {concept.designNotes.length > 0 && <ul className="design-notes">{concept.designNotes.slice(0, 3).map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}</ul>}
      <p className="viewer-note">Концепцията е генерирана от DeepSeek. Цветовете и обемът служат за ориентация; за реално изпълнение са необходими оглед, размери и проект от квалифицирани специалисти.</p>
    </section>
  );
}

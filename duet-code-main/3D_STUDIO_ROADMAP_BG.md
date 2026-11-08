# BuildAI 3D Studio Pro — реалистична пътна карта

BuildAI 3D Studio е браузърен процедурен редактор за сгради, интериори, публични пространства и общи 3D обекти. Текущата версия добавя базови инструменти за избор, трансформации, йерархия, undo/redo, импорт/експорт и експериментални геометрични операции. Това е по-широк редакторски прототип, но все още не е конкурент по възможности на Blender.

## Внедрено в тази версия

- Three.js `0.186.1`, `TransformControls`, `OrbitControls`, `GLTFLoader`, `OBJLoader`, `STLLoader`, `GLTFExporter`, `OBJExporter`, `STLExporter`.
- `three-mesh-bvh` `0.9.16` за ускорен raycasting и избор на сложни mesh-ове.
- `three-bvh-csg` `0.0.18` за експериментално изрязване на затворена геометрия.
- Избор чрез viewport/йерархия, точно позициониране/завъртане/мащабиране, преименуване, видимост, фокусиране, дублиране и изтриване.
- Undo/redo история, измервания и snapping.
- Импорт GLB/glTF/OBJ/STL и експорт GLB/OBJ/STL/PNG; архитектурен план като SVG, PDF и DXF (стени, стаи, врати, прозорци, размери и таблица на помещенията).
- Материализиране на активния `drawRange` при CSG резултат преди експорт, за да се избегне включването на скрити триъгълници от exporter.

## Какво все още липсва за ниво на професионален 3D пакет

1. **Истински геометричен kernel:** стабилна топология, mesh repair, manifold validation, robust booleans и работа с NURBS/solid B-rep. Текущият CSG е експериментален и работи най-добре с водонепропускливи mesh-ове.
2. **Edit/Sculpt mode:** vertex/edge/face selection, extrude, inset, bevel, loop cut, proportional editing, sculpt brushes, retopology.
3. **Материали и UV:** UV editor, texture painting, node-based material graph, PBR texture slots, baking.
4. **Animation/rigging:** armature, keyframes, timeline, constraints, skinning и animation export.
5. **Production rendering:** path tracing, denoising, shadow/render quality controls, color management, render queue.
6. **Точност и формати:** валидиран IFC/BIM pipeline, DWG/DXF import/export чрез специализирани компоненти и проверка на единици/координатни системи.
7. **Големи сцени:** out-of-core meshes, worker jobs, LOD, instancing, undo журнал на операции, memory profiling.
8. **Надеждност:** browser integration tests, GLB regression fixtures, тестове за импорт/експорт и CSG; CI и production build с фиксиран lockfile.
9. **Производствена архитектура:** отделни модулни редакторски пакети, versioned document format, autosave recovery, plugin API и миграции на файловете.

## Препоръчан ред на работа

- **Фаза 1:** стабилизиране на редакторските действия, тестове за GLB/OBJ/STL и browser smoke tests.
- **Фаза 2:** vertex/edge/face edit mode, bevel/extrude и по-сигурни CSG операции.
- **Фаза 3:** материален редактор, текстури, UV unwrap и библиотека от активи.
- **Фаза 4:** стабилно IFC/BIM свързване и двупосочна връзка между 3D елементи, количества и бюджета на проекта.
- **Фаза 5:** анимация, по-висококачествен рендер и разширяем plugin API.

## Ограничения за текущата версия

- Процедурният/AI модел е концептуален, не е фотограметрично или инженерно точен.
- `three-bvh-csg` е маркиран като експериментален; библиотеката предупреждава за проблеми при непълна manifold геометрия и числена прецизност. След CSG операция провери изгледа и експортирания файл.
- Пълният Next.js production build и реално WebGL поведение трябва да бъдат проверени в Kuso, където са достъпни npm зависимостите и CDN.

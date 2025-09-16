import React, { useRef, useState, useEffect } from 'react';
import './App.css';

const SURFACES = ['Asphalt', 'Dirt', 'Gravel', 'Sand', 'Snow', 'Ice'];
const CORNERS = ['High speed', 'Medium Speed', 'Low Speed'];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [points, setPoints] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [connectMode, setConnectMode] = useState(false);
  const [trackLengthKm, setTrackLengthKm] = useState(5);
  const [raceType, setRaceType] = useState('Circuit');

  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const draggingRef = useRef(null);

  // load image file as data URL
  function onFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImageSrc(ev.target.result);
    reader.readAsDataURL(f);
  }

  // import exported track JSON (with embedded image)
  function onImportFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        // validate basic shape
        if (!json || typeof json !== 'object') throw new Error('Invalid JSON');
        const importedPoints = Array.isArray(json.points) ? json.points.map((p) => ({
          id: p.id || uid(),
          x: Number(p.x) || 0,
          y: Number(p.y) || 0,
          surface: p.surface ?? null,
          corner: p.corner ?? null,
          incline: typeof p.incline === 'number' ? p.incline : Number(p.incline) || 0,
        })) : [];
        const importedEdges = Array.isArray(json.edges) ? json.edges.map((e) => ({ ...e })) : [];
        setPoints(importedPoints);
        setEdges(importedEdges);
        setImageSrc(json.image || null);
        if (json.meta) {
          if (json.meta.trackLengthKm != null) setTrackLengthKm(Number(json.meta.trackLengthKm) || 0);
          if (json.meta.raceType) setRaceType(json.meta.raceType);
        }
        setSelectedIds([]);
        setConnectFrom(null);
        alert('Track imported successfully');
      } catch (err) {
        console.error('Import error', err);
        alert('Failed to import track: ' + (err.message || err));
      }
    };
    reader.readAsText(f);
    // reset the input so same file can be reloaded later if needed
    e.target.value = '';
  }

  // convert client coords to svg coords
  function toSvgCoords(clientX, clientY) {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const screenCTM = svg.getScreenCTM();
    if (!screenCTM) return { x: clientX, y: clientY };
    const loc = pt.matrixTransform(screenCTM.inverse());
    return { x: loc.x, y: loc.y };
  }

  function handleSvgClick(e) {
    // don't add point if clicking on a marker (handled by marker click)
    if (draggingRef.current) return;
    const { x, y } = toSvgCoords(e.clientX, e.clientY);
    const p = { id: uid(), x, y, surface: null, corner: null, incline: 0 };
    setPoints((s) => [...s, p]);
    setSelectedIds([p.id]);
  }

  // keyboard: Z to undo last point
  useEffect(() => {
    function onKey(e) {
      if ((e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey) {
        setPoints((s) => s.slice(0, -1));
        setSelectedIds([]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // drag handlers
  function onPointMouseDown(e, id) {
    e.stopPropagation();
    draggingRef.current = id;
  }

  function onMouseMove(e) {
    const id = draggingRef.current;
    if (!id) return;
    const { x, y } = toSvgCoords(e.clientX, e.clientY);
    setPoints((list) => list.map((p) => (p.id === id ? { ...p, x, y } : p)));
  }

  function onMouseUp() {
    draggingRef.current = null;
  }

  // selection
  function toggleSelect(id, additive = false) {
    setSelectedIds((cur) => {
      if (!additive) return [id];
      return cur.includes(id) ? cur.filter((i) => i !== id) : [...cur, id];
    });
  }

  // assign attribute to selected points
  function assignAttribute(key, value) {
    setPoints((list) => list.map((p) => (selectedIds.includes(p.id) ? { ...p, [key]: value } : p)));
  }

  // connect mode: reorder points by selecting first then second
  const [connectFrom, setConnectFrom] = useState(null);
  const [edges, setEdges] = useState([]);

  function onPointClick(e, id) {
    e.stopPropagation();
    if (connectMode) {
      // Start or clear the 'from' selection
      if (!connectFrom) {
        setConnectFrom(id);
        setSelectedIds([id]);
        return;
      }

      // If clicking the same, clear
      if (connectFrom === id) {
        setConnectFrom(null);
        return;
      }

      // create an undirected edge between connectFrom and id (avoid duplicates)
      setEdges((list) => {
        const a = connectFrom;
        const b = id;
        // normalize order for uniqueness
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (list.some((e) => e.key === key)) return list;
        return [...list, { key, a, b }];
      });

      // clear connect selection and select the newly connected point
      setConnectFrom(null);
      setSelectedIds([id]);
    } else {
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      toggleSelect(id, additive);
    }
  }

  function exportTrack() {
    const payload = {
      meta: { trackLengthKm, raceType, createdAt: new Date().toISOString() },
      points,
      edges,
      image: imageSrc,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'track.json';
    a.click();
  }

  return (
    <div className="tracker-app">
      <aside className="toolbar">
        <h2>Track Tracer</h2>
        <label className="file">
          Reference Image
          <input type="file" accept="image/*" onChange={onFile} />
        </label>

        <label className="import-file" style={{ display: 'block', marginTop: 8 }}>
          Import Track
          <input type="file" accept="application/json" onChange={onImportFile} style={{ display: 'block', marginTop: 6 }} />
        </label>

        <div className="controls">
          <label>
            Track Length (KM)
            <input type="number" min="0" step="0.1" value={trackLengthKm} onChange={(e) => setTrackLengthKm(Number(e.target.value))} />
          </label>
          <label>
            Race Type
            <select value={raceType} onChange={(e) => setRaceType(e.target.value)}>
              <option>Point to point</option>
              <option>Circuit</option>
            </select>
          </label>
          <label className="connect-toggle">
            <input type="checkbox" checked={connectMode} onChange={(e) => setConnectMode(e.target.checked)} /> Connect Mode
          </label>
        </div>

        <div className="attribs">
          <h3>Attributes (multi-select)</h3>
          <div className="attrib-row">
            <label>Surface</label>
            <select onChange={(e) => assignAttribute('surface', e.target.value)} value={selectedIds.length ? points.find(p => p.id === selectedIds[0])?.surface || '' : ''}>
              <option value="">--</option>
              {SURFACES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
          <div className="attrib-row">
            <label>Corner Type</label>
            <select onChange={(e) => assignAttribute('corner', e.target.value)} value={selectedIds.length ? points.find(p => p.id === selectedIds[0])?.corner || '' : ''}>
              <option value="">--</option>
              {CORNERS.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div className="attrib-row">
            <label>Incline (deg)</label>
            <input type="number" step="0.1" onChange={(e) => assignAttribute('incline', Number(e.target.value))} value={selectedIds.length ? points.find(p => p.id === selectedIds[0])?.incline ?? 0 : 0} />
          </div>
        </div>

        <div className="actions">
          <button onClick={() => { setPoints([]); setSelectedIds([]); }}>Clear</button>
          <button onClick={() => { setPoints((s) => s.slice(0, -1)); setSelectedIds([]); }}>Undo Last (Z)</button>
          <button onClick={() => { setEdges([]); }}>Clear Edges</button>
          <button onClick={exportTrack} disabled={!points.length}>Export (JSON+Image)</button>
        </div>

        <div className="help">
          <p>Click on canvas to add point. Drag point to adjust. Shift/Ctrl+Click to multi-select. Use Connect Mode to reorder points so they connect in a different order.</p>
        </div>
      </aside>

      <main className="canvas-area" ref={containerRef}>
        <div className="canvas-inner" onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
          <svg ref={svgRef} className="canvas-svg" onClick={handleSvgClick} xmlns="http://www.w3.org/2000/svg">
            {/* background image */}
            {imageSrc && (
              <image href={imageSrc} x="0" y="0" preserveAspectRatio="xMidYMid meet" width="100%" height="100%" />
            )}

            {/* connecting polyline */}
            {points.length > 0 && (
              <polyline
                points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#00f"
                strokeWidth="2"
              />
            )}

            {/* explicit edges created in Connect Mode */}
            {edges.map((e) => {
              const pa = points.find((p) => p.id === e.a);
              const pb = points.find((p) => p.id === e.b);
              if (!pa || !pb) return null;
              return (
                <line key={e.key} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#0a0" strokeWidth={2} strokeDasharray="4 3" />
              );
            })}

            {/* if circuit race type, draw a closing line from last to first */}
            {raceType === 'Circuit' && points.length > 1 && (
              <line x1={points[0].x} y1={points[0].y} x2={points[points.length - 1].x} y2={points[points.length - 1].y} stroke="#00f" strokeWidth={2} strokeDasharray="2 2" />
            )}

            {/* markers */}
            {points.map((p, idx) => (
              <g key={p.id} className={connectFrom === p.id ? 'connect-from' : ''} transform={`translate(${p.x},${p.y})`}>
                <circle r={5} fill={selectedIds.includes(p.id) ? '#ff0' : '#f00'} stroke="#000" strokeWidth={1} onMouseDown={(e) => onPointMouseDown(e, p.id)} onClick={(e) => onPointClick(e, p.id)} style={{ cursor: 'pointer' }} />
                <text x={12} y={4} fontSize={12} fill="#000">{idx + 1}</text>
              </g>
            ))}
          </svg>
        </div>
      </main>
    </div>
  );
}

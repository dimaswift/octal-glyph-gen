import {
  Braces,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Diamond,
  Download,
  FileUp,
  Grid3X3,
  Maximize2,
  Moon,
  PencilRuler,
  Plus,
  RotateCcw,
  Shuffle,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import {
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import { DEFAULT_ARMS, DEFAULT_CORE_HOLE, DEFAULT_FONT, cloneDefaultFont } from './glyph/defaultFont'
import {
  alignArmEndpoints,
  buildGlyphRender,
  getRenderPadding,
  hasInvalidOctalDigits,
  normalizeFont,
  pointsToSvg,
  rotatePoint,
  sanitizeOctalInput,
} from './glyph/renderer'
import { DIGIT_KEYS, type DigitKey, type GlyphFont, type Point } from './glyph/types'

type EditorMode = 'arms' | 'core'
type CoreLayer = 'outer' | 'hole'
type GridMode = 'square' | 'diagonal' | 'triangular'
type OutputMode = 'preview' | 'atlas'
type SocketEndpoint = 'start' | 'end'
type AtlasOrder = 'ordered' | 'shuffled'
type Theme = 'light' | 'dark'

type DragTarget =
  | { kind: 'arm'; index: number }
  | { kind: 'core'; layer: CoreLayer; index: number }
  | { kind: 'socket'; endpoint: SocketEndpoint }

const VIEWBOX_EXTENT = 180
const ATLAS_GAP = 8
const DEFAULT_ATLAS_CELL_SIZE = 112

function App() {
  const [font, setFont] = useState<GlyphFont>(() => cloneDefaultFont())
  const [mode, setMode] = useState<EditorMode>('arms')
  const [selectedDigit, setSelectedDigit] = useState<DigitKey>('2')
  const [selectedArmPoint, setSelectedArmPoint] = useState(1)
  const [selectedCoreLayer, setSelectedCoreLayer] = useState<CoreLayer>('outer')
  const [selectedCorePoint, setSelectedCorePoint] = useState(0)
  const [selectedSocket, setSelectedSocket] = useState<SocketEndpoint>('start')
  const [gridSize, setGridSize] = useState(DEFAULT_FONT.renderer.gridSize)
  const [gridMode, setGridMode] = useState<GridMode>('square')
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [octalInput, setOctalInput] = useState('1120')
  const [decimalInput, setDecimalInput] = useState(() => octalToDecimalString('1120'))
  const [outputMode, setOutputMode] = useState<OutputMode>('preview')
  const [isAtlasOpen, setIsAtlasOpen] = useState(false)
  const [atlasOrder, setAtlasOrder] = useState<AtlasOrder>('ordered')
  const [atlasSeed, setAtlasSeed] = useState(1)
  const [atlasPage, setAtlasPage] = useState(0n)
  const [atlasCellSize, setAtlasCellSize] = useState(DEFAULT_ATLAS_CELL_SIZE)
  const [showAtlasLabels, setShowAtlasLabels] = useState(true)
  const [theme, setTheme] = useState<Theme>('light')
  const [viewport, setViewport] = useState(getInitialViewport)
  const [status, setStatus] = useState('Ready')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const renderResult = useMemo(() => buildGlyphRender(font, octalInput), [font, octalInput])
  const renderPadding = useMemo(() => getRenderPadding(font), [font])
  const atlasLayout = useMemo(() => calculateAtlasLayout(viewport, atlasCellSize), [atlasCellSize, viewport])
  const atlasPageSize = BigInt(atlasLayout.pageSize)
  const atlasTotalCount = useMemo(() => 8n ** BigInt(font.core.digitsPerGlyph), [font.core.digitsPerGlyph])
  const atlasPageCount = useMemo(
    () => (atlasTotalCount + atlasPageSize - 1n) / atlasPageSize,
    [atlasPageSize, atlasTotalCount],
  )
  const currentAtlasPage = useMemo(() => clampAtlasPage(atlasPage, atlasPageCount), [atlasPage, atlasPageCount])
  const atlasActive = outputMode === 'atlas' || isAtlasOpen
  const atlasPageSummary = useMemo(
    () =>
      atlasActive
        ? buildAtlasPage(font, currentAtlasPage, atlasTotalCount, atlasLayout.pageSize, atlasOrder === 'shuffled', atlasSeed)
        : {
            cells: [],
            startSlot: currentAtlasPage * atlasPageSize,
            endSlot: currentAtlasPage * atlasPageSize,
            cellCount: 0,
          },
    [atlasActive, atlasLayout.pageSize, atlasOrder, atlasPageSize, atlasSeed, atlasTotalCount, currentAtlasPage, font],
  )
  const exportJson = useMemo(() => JSON.stringify(font, null, 2), [font])
  const activeArm = alignArmEndpoints(font, font.arms[selectedDigit])
  const activeArmPoint = activeArm[selectedArmPoint] ?? activeArm[0]
  const coreIsHollow = font.core.holes.length > 0
  const activeCorePoints = selectedCoreLayer === 'hole' ? (font.core.holes[0] ?? DEFAULT_CORE_HOLE) : font.core.polygon
  const activeCorePoint = activeCorePoints[selectedCorePoint] ?? activeCorePoints[0]
  const invalidInput = hasInvalidOctalDigits(octalInput)
  const cleanInput = sanitizeOctalInput(octalInput) || '0'

  useEffect(() => {
    const handleResize = () => setViewport(getInitialViewport())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!isAtlasOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAtlasOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isAtlasOpen])

  function updateFont(mutator: (draft: GlyphFont) => void) {
    setFont((current) => {
      const draft = structuredClone(current)
      mutator(draft)
      return normalizeFont(draft)
    })
  }

  function updateArmPoint(index: number, point: Point) {
    if (index === 0 || index === activeArm.length - 1) {
      return
    }

    updateFont((draft) => {
      draft.arms[selectedDigit][index] = point
    })
  }

  function updateCorePoint(layer: CoreLayer, index: number, point: Point) {
    updateFont((draft) => {
      if (layer === 'hole') {
        draft.core.holes[0] = draft.core.holes[0] ?? structuredClone(DEFAULT_CORE_HOLE)
        draft.core.holes[0][index] = point
      } else {
        draft.core.polygon[index] = point
      }
    })
  }

  function updateSocket(endpoint: SocketEndpoint, point: Point) {
    updateFont((draft) => {
      if (endpoint === 'start') {
        draft.core.socketStart = point
      } else {
        draft.core.socketEnd = point
      }
    })
  }

  function handleOctalInputChange(value: string) {
    setOctalInput(value)
    setDecimalInput(octalToDecimalString(value))
  }

  function handleDecimalInputChange(value: string) {
    const cleanDecimal = sanitizeDecimalInput(value)
    setDecimalInput(cleanDecimal)
    setOctalInput(cleanDecimal === '' ? '' : BigInt(cleanDecimal).toString(8))
  }

  function addArmPoint() {
    const insertAt = Math.min(Math.max(1, selectedArmPoint + 1), activeArm.length - 1)
    const previous = activeArm[insertAt - 1]
    const next = activeArm[insertAt]

    updateFont((draft) => {
      const points = draft.arms[selectedDigit]
      points.splice(insertAt, 0, midpoint(previous, next))
    })
    setSelectedArmPoint(insertAt)
  }

  function deleteArmPoint() {
    if (selectedArmPoint === 0 || selectedArmPoint === activeArm.length - 1) {
      return
    }

    const nextSelectedPoint = Math.max(1, Math.min(selectedArmPoint - 1, activeArm.length - 3))
    updateFont((draft) => {
      draft.arms[selectedDigit].splice(selectedArmPoint, 1)
    })
    setSelectedArmPoint(nextSelectedPoint)
  }

  function addCorePoint() {
    const points = activeCorePoints
    const insertAt = selectedCorePoint + 1
    const previous = points[selectedCorePoint]
    const next = points[insertAt % points.length]

    updateFont((draft) => {
      const target = selectedCoreLayer === 'hole' ? ensureCoreHole(draft) : draft.core.polygon
      target.splice(insertAt, 0, midpoint(previous, next))
    })
    setSelectedCorePoint(insertAt)
  }

  function deleteCorePoint() {
    if (activeCorePoints.length <= 3) {
      return
    }

    const nextSelectedPoint = Math.max(0, Math.min(selectedCorePoint - 1, activeCorePoints.length - 2))
    updateFont((draft) => {
      const target = selectedCoreLayer === 'hole' ? ensureCoreHole(draft) : draft.core.polygon
      target.splice(selectedCorePoint, 1)
    })
    setSelectedCorePoint(nextSelectedPoint)
  }

  function setCoreHollow(enabled: boolean) {
    updateFont((draft) => {
      draft.core.holes = enabled ? [structuredClone(draft.core.holes[0] ?? DEFAULT_CORE_HOLE)] : []
    })
    setSelectedCoreLayer(enabled ? 'hole' : 'outer')
    setSelectedCorePoint(0)
  }

  function resetArm() {
    updateFont((draft) => {
      draft.arms[selectedDigit] = structuredClone(DEFAULT_ARMS[selectedDigit])
    })
    setSelectedArmPoint(Math.min(1, DEFAULT_ARMS[selectedDigit].length - 1))
  }

  function resetCore() {
    updateFont((draft) => {
      draft.core = structuredClone(DEFAULT_FONT.core)
    })
    setSelectedCoreLayer('outer')
    setSelectedCorePoint(0)
    setSelectedSocket('start')
  }

  function resetFont() {
    setFont(cloneDefaultFont())
    setGridSize(DEFAULT_FONT.renderer.gridSize)
    setAtlasOrder('ordered')
    setAtlasPage(0n)
    setSelectedDigit('2')
    setSelectedArmPoint(1)
    setSelectedCoreLayer('outer')
    setSelectedCorePoint(0)
    setSelectedSocket('start')
    setStatus('Reset to default font')
  }

  async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(value)
    setStatus(`${label} copied`)
  }

  function setAtlasPageState(nextPage: bigint) {
    const clamped = clampAtlasPage(nextPage, atlasPageCount)
    setAtlasPage(clamped)
  }

  function applyAtlasPageInput(value: string) {
    const pageNumber = parsePositiveInteger(value)
    setAtlasPageState(pageNumber === null ? 0n : pageNumber - 1n)
  }

  function openAtlas(order: AtlasOrder = atlasOrder) {
    setAtlasOrder(order)
    setOutputMode('atlas')
    setIsAtlasOpen(true)
  }

  function activateShuffle() {
    setAtlasOrder('shuffled')
    setAtlasSeed((seed) => seed + 1)
  }

  function downloadText(value: string, filename: string, type: string) {
    const blob = new Blob([value], { type })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
    setStatus(`${filename} exported`)
  }

  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const parsed = JSON.parse(await file.text()) as Partial<GlyphFont>
      const nextFont = normalizeFont(parsed)
      setFont(nextFont)
      setGridSize(nextFont.renderer.gridSize)
      setAtlasOrder('ordered')
      setAtlasPage(0n)
      setStatus(`${file.name} imported`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import failed')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <main className={`app-shell theme-${theme}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <Diamond size={18} strokeWidth={2.4} />
          </span>
          <div>
            <h1>Octal Glyph Studio</h1>
            <p>{font.name}</p>
          </div>
        </div>

        <div className="topbar-actions">
          <label className="number-field">
            <span>Octal</span>
            <input
              value={octalInput}
              onChange={(event) => handleOctalInputChange(event.target.value)}
              spellCheck={false}
              aria-invalid={invalidInput}
            />
          </label>
          <label className="number-field">
            <span>Decimal</span>
            <input
              value={decimalInput}
              onChange={(event) => handleDecimalInputChange(event.target.value)}
              inputMode="numeric"
              spellCheck={false}
            />
          </label>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={16} />
            Import
          </button>
          <button
            type="button"
            onClick={() => downloadText(exportJson, 'octal-glyph-font.json', 'application/json')}
          >
            <Download size={16} />
            JSON
          </button>
          <button
            type="button"
            className="icon-button theme-toggle"
            title={theme === 'light' ? 'Dark theme' : 'Light theme'}
            aria-label={theme === 'light' ? 'Dark theme' : 'Light theme'}
            onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <input ref={fileInputRef} className="hidden-input" type="file" accept=".json" onChange={importJson} />
        </div>
      </header>

      <section className="workspace" aria-label="Glyph editor workspace">
        <aside className="panel editor-panel">
          <div className="panel-title">
            <PencilRuler size={17} />
            <h2>Editor</h2>
          </div>

          <div className="tabs" role="tablist" aria-label="Editor mode">
            <button type="button" className={mode === 'arms' ? 'active' : ''} onClick={() => setMode('arms')}>
              Arms
            </button>
            <button type="button" className={mode === 'core' ? 'active' : ''} onClick={() => setMode('core')}>
              Core
            </button>
          </div>

          {mode === 'arms' ? (
            <>
              <div className="digit-strip" aria-label="Arm digit">
                {DIGIT_KEYS.map((digit) => (
                  <button
                    type="button"
                    className={digit === selectedDigit ? 'active' : ''}
                    key={digit}
                    onClick={() => {
                      setSelectedDigit(digit)
                      setSelectedArmPoint(Math.min(1, font.arms[digit].length - 1))
                    }}
                  >
                    {digit}
                  </button>
                ))}
              </div>

              <PointList
                points={activeArm}
                selectedIndex={selectedArmPoint}
                lockedIndexes={[0, activeArm.length - 1]}
                onSelect={setSelectedArmPoint}
              />

              <div className="point-editor">
                <h3>Point {selectedArmPoint}</h3>
                <CoordinateInputs
                  point={activeArmPoint}
                  disabled={selectedArmPoint === 0 || selectedArmPoint === activeArm.length - 1}
                  onChange={(point) => updateArmPoint(selectedArmPoint, point)}
                />
                <div className="button-row">
                  <IconButton title="Add point" onClick={addArmPoint}>
                    <Plus size={16} />
                  </IconButton>
                  <IconButton
                    title="Delete point"
                    onClick={deleteArmPoint}
                    disabled={selectedArmPoint === 0 || selectedArmPoint === activeArm.length - 1}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                  <IconButton title="Reset arm" onClick={resetArm}>
                    <RotateCcw size={16} />
                  </IconButton>
                </div>
              </div>
            </>
          ) : (
            <>
              <label className="check-row">
                <input type="checkbox" checked={coreIsHollow} onChange={(event) => setCoreHollow(event.target.checked)} />
                <span>Hollow core</span>
              </label>

              <div className="socket-switch">
                <button
                  type="button"
                  className={selectedCoreLayer === 'outer' ? 'active' : ''}
                  onClick={() => {
                    setSelectedCoreLayer('outer')
                    setSelectedCorePoint(0)
                  }}
                >
                  Outer
                </button>
                <button
                  type="button"
                  className={selectedCoreLayer === 'hole' ? 'active' : ''}
                  disabled={!coreIsHollow}
                  onClick={() => {
                    setSelectedCoreLayer('hole')
                    setSelectedCorePoint(0)
                  }}
                >
                  Hole
                </button>
              </div>

              <PointList points={activeCorePoints} selectedIndex={selectedCorePoint} onSelect={setSelectedCorePoint} />

              <div className="point-editor">
                <h3>{selectedCoreLayer === 'hole' ? 'Hole' : 'Core'} point {selectedCorePoint}</h3>
                <CoordinateInputs
                  point={activeCorePoint}
                  onChange={(point) => updateCorePoint(selectedCoreLayer, selectedCorePoint, point)}
                />
                <div className="button-row">
                  <IconButton title="Add core point" onClick={addCorePoint}>
                    <Plus size={16} />
                  </IconButton>
                  <IconButton title="Delete core point" onClick={deleteCorePoint} disabled={activeCorePoints.length <= 3}>
                    <Trash2 size={16} />
                  </IconButton>
                  <IconButton title="Reset core" onClick={resetCore}>
                    <RotateCcw size={16} />
                  </IconButton>
                </div>
              </div>

              <div className="point-editor">
                <h3>Socket {selectedSocket}</h3>
                <div className="socket-switch">
                  <button
                    type="button"
                    className={selectedSocket === 'start' ? 'active' : ''}
                    onClick={() => setSelectedSocket('start')}
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    className={selectedSocket === 'end' ? 'active' : ''}
                    onClick={() => setSelectedSocket('end')}
                  >
                    End
                  </button>
                </div>
                <CoordinateInputs
                  point={selectedSocket === 'start' ? font.core.socketStart : font.core.socketEnd}
                  onChange={(point) => updateSocket(selectedSocket, point)}
                />
              </div>
            </>
          )}

          <div className="settings-block">
            <label className="check-row">
              <input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} />
              <span>Snap to grid</span>
            </label>
            <label>
              <span>
                <Grid3X3 size={14} />
                Snap grid
              </span>
              <input
                type="number"
                min={2}
                max={48}
                value={gridSize}
                onChange={(event) => setGridSize(clampNumber(Number(event.target.value), 2, 48))}
              />
            </label>
            <div className="settings-field">
              <span>Grid type</span>
              <div className="grid-mode-switch">
                <button
                  type="button"
                  className={gridMode === 'square' ? 'active' : ''}
                  onClick={() => setGridMode('square')}
                >
                  Square
                </button>
                <button
                  type="button"
                  className={gridMode === 'diagonal' ? 'active' : ''}
                  onClick={() => setGridMode('diagonal')}
                >
                  Diagonal
                </button>
                <button
                  type="button"
                  className={gridMode === 'triangular' ? 'active' : ''}
                  onClick={() => setGridMode('triangular')}
                >
                  Triangular
                </button>
              </div>
            </div>
            <label>
              <span>Digits</span>
              <input
                type="number"
                min={1}
                max={32}
                value={font.core.digitsPerGlyph}
                onChange={(event) =>
                  updateFont((draft) => {
                    draft.core.digitsPerGlyph = clampNumber(Number(event.target.value), 1, 32)
                  })
                }
              />
            </label>
            <label>
              <span>Step</span>
              <input
                type="number"
                value={font.core.rotationStepDeg}
                onChange={(event) =>
                  updateFont((draft) => {
                    draft.core.rotationStepDeg = Number(event.target.value)
                  })
                }
              />
            </label>
            <label>
              <span>Stack</span>
              <input
                type="number"
                min={80}
                value={font.core.glyphSpacing}
                onChange={(event) =>
                  updateFont((draft) => {
                    draft.core.glyphSpacing = Number(event.target.value)
                  })
                }
              />
            </label>
          </div>
        </aside>

        <section className="canvas-panel">
          <EditorCanvas
            font={font}
            mode={mode}
            selectedDigit={selectedDigit}
            selectedArmPoint={selectedArmPoint}
            selectedCoreLayer={selectedCoreLayer}
            selectedCorePoint={selectedCorePoint}
            selectedSocket={selectedSocket}
            gridSize={gridSize}
            gridMode={gridMode}
            snapToGrid={snapToGrid}
            onArmPointChange={updateArmPoint}
            onCorePointChange={updateCorePoint}
            onSocketChange={updateSocket}
            onSelectArmPoint={setSelectedArmPoint}
            onSelectCoreLayer={setSelectedCoreLayer}
            onSelectCorePoint={setSelectedCorePoint}
            onSelectSocket={setSelectedSocket}
          />
        </section>

        <aside className="panel output-panel">
          <div className="panel-title">
            <Braces size={17} />
            <h2>Renderer</h2>
          </div>

          <div className="output-tabs" role="tablist" aria-label="Renderer view">
            <button
              type="button"
              className={outputMode === 'preview' ? 'active' : ''}
              onClick={() => {
                setOutputMode('preview')
                setIsAtlasOpen(false)
              }}
            >
              Preview
            </button>
            <button
              type="button"
              className={outputMode === 'atlas' ? 'active' : ''}
              onClick={() => openAtlas()}
            >
              Atlas
            </button>
          </div>

          {outputMode === 'preview' ? (
            <>
              <div className="preview-frame">
                <svg viewBox={renderResult.viewBox} role="img" aria-label={`Glyph preview for ${cleanInput}`}>
                  <path d={renderResult.path} fill={font.renderer.fill} fillRule="evenodd" />
                </svg>
              </div>

              <div className="render-meta">
                <span className={invalidInput ? 'warning' : 'ok'}>
                  {invalidInput ? 'Invalid digits ignored' : 'Octal input valid'}
                </span>
                <span>{renderResult.chunks.length} glyph layer{renderResult.chunks.length === 1 ? '' : 's'}</span>
                <span>{font.renderer.paddingCells} pad cells</span>
              </div>
            </>
          ) : (
            <AtlasSummary
              atlasOrder={atlasOrder}
              atlasCellSize={atlasCellSize}
              atlasLayout={atlasLayout}
              atlasPage={currentAtlasPage}
              atlasPageCount={atlasPageCount}
              digitsPerGlyph={font.core.digitsPerGlyph}
              pageSummary={atlasPageSummary}
              renderPadding={renderPadding}
              showLabels={showAtlasLabels}
              totalCount={atlasTotalCount}
              onAtlasCellSizeChange={setAtlasCellSize}
              onLabelsChange={setShowAtlasLabels}
              onOpen={() => setIsAtlasOpen(true)}
              onNext={() => setAtlasPageState(currentAtlasPage + 1n)}
              onPrevious={() => setAtlasPageState(currentAtlasPage - 1n)}
              onOrdered={() => setAtlasOrder('ordered')}
              onShuffle={activateShuffle}
            />
          )}

          <div className="settings-block">
            <label>
              <span>Fill</span>
              <input
                type="color"
                value={font.renderer.fill}
                onChange={(event) =>
                  updateFont((draft) => {
                    draft.renderer.fill = event.target.value
                  })
                }
              />
            </label>
            <label>
              <span>Pad grid</span>
              <input
                type="number"
                min={1}
                max={64}
                value={font.renderer.gridSize}
                onChange={(event) =>
                  updateFont((draft) => {
                    draft.renderer.gridSize = clampNumber(Number(event.target.value), 1, 64)
                  })
                }
              />
            </label>
            <label>
              <span>Pad cells</span>
              <input
                type="number"
                min={0}
                step={0.25}
                value={font.renderer.paddingCells}
                onChange={(event) =>
                  updateFont((draft) => {
                    draft.renderer.paddingCells = Math.max(0, Number(event.target.value))
                  })
                }
              />
            </label>
            <div className="settings-note">Padding resolves to {formatCoord(renderPadding)} units in the SVG viewBox.</div>
          </div>

          <div className="export-actions">
            <button type="button" onClick={() => copyText(renderResult.svg, 'SVG')}>
              <Copy size={16} />
              Copy SVG
            </button>
            <button
              type="button"
              onClick={() => downloadText(renderResult.svg, `octal-${cleanInput}.svg`, 'image/svg+xml')}
            >
              <Download size={16} />
              SVG
            </button>
            <button type="button" onClick={() => copyText(exportJson, 'JSON')}>
              <Copy size={16} />
              Copy JSON
            </button>
            <button type="button" onClick={resetFont}>
              <RotateCcw size={16} />
              Reset
            </button>
          </div>

          <textarea className="json-view" value={exportJson} readOnly spellCheck={false} aria-label="Font JSON" />

          <div className="status-line">
            <CheckCircle2 size={15} />
            <span>{status}</span>
          </div>
        </aside>
      </section>

      {isAtlasOpen && (
        <AtlasWindow
          atlasOrder={atlasOrder}
          atlasCellSize={atlasCellSize}
          atlasLayout={atlasLayout}
          atlasPage={currentAtlasPage}
          atlasPageCount={atlasPageCount}
          digitsPerGlyph={font.core.digitsPerGlyph}
          fill={font.renderer.fill}
          pageSummary={atlasPageSummary}
          showLabels={showAtlasLabels}
          totalCount={atlasTotalCount}
          onAtlasCellSizeChange={setAtlasCellSize}
          onAtlasPageInputCommit={applyAtlasPageInput}
          onClose={() => setIsAtlasOpen(false)}
          onLabelsChange={setShowAtlasLabels}
          onNext={() => setAtlasPageState(currentAtlasPage + 1n)}
          onPrevious={() => setAtlasPageState(currentAtlasPage - 1n)}
          onOrdered={() => setAtlasOrder('ordered')}
          onShuffle={activateShuffle}
        />
      )}
    </main>
  )
}

type AtlasCell = {
  slot: bigint
  value: string
  render: ReturnType<typeof buildGlyphRender>
}

type AtlasPageSummary = {
  cells: Array<AtlasCell | null>
  startSlot: bigint
  endSlot: bigint
  cellCount: number
}

type AtlasLayout = {
  columns: number
  rows: number
  pageSize: number
}

type AtlasSummaryProps = {
  atlasOrder: AtlasOrder
  atlasCellSize: number
  atlasLayout: AtlasLayout
  atlasPage: bigint
  atlasPageCount: bigint
  digitsPerGlyph: number
  pageSummary: AtlasPageSummary
  renderPadding: number
  showLabels: boolean
  totalCount: bigint
  onAtlasCellSizeChange: (value: number) => void
  onLabelsChange: (value: boolean) => void
  onOpen: () => void
  onNext: () => void
  onPrevious: () => void
  onOrdered: () => void
  onShuffle: () => void
}

function AtlasSummary({
  atlasOrder,
  atlasCellSize,
  atlasLayout,
  atlasPage,
  atlasPageCount,
  digitsPerGlyph,
  pageSummary,
  renderPadding,
  showLabels,
  totalCount,
  onAtlasCellSizeChange,
  onLabelsChange,
  onOpen,
  onNext,
  onPrevious,
  onOrdered,
  onShuffle,
}: AtlasSummaryProps) {
  const slotStart = toPaddedOctal(pageSummary.startSlot, digitsPerGlyph)
  const slotEnd = toPaddedOctal(pageSummary.endSlot, digitsPerGlyph)

  return (
    <div className="atlas-summary" aria-label="Paged glyph atlas">
      <div className="atlas-summary-copy">
        <h3>Fullscreen atlas</h3>
        <p>
          {formatBigInt(totalCount)} glyphs, {formatBigInt(atlasPageCount)} pages, {digitsPerGlyph} digits per glyph.
        </p>
      </div>
      <div className="atlas-summary-meta">
        <span>Page {formatBigInt(atlasPage + 1n)} / {formatBigInt(atlasPageCount)}</span>
        <span>{atlasLayout.columns}x{atlasLayout.rows} page grid</span>
        <span>{pageSummary.cellCount} glyphs on this page</span>
        <span>{atlasOrder === 'ordered' ? `${slotStart} to ${slotEnd}` : `Shuffled slots ${slotStart} to ${slotEnd}`}</span>
        <span>{formatCoord(renderPadding)} units padding</span>
      </div>
      <div className="atlas-summary-actions">
        <div className="atlas-order-switch">
          <button type="button" className={atlasOrder === 'ordered' ? 'active' : ''} onClick={onOrdered}>
            Ordered
          </button>
          <button type="button" className={atlasOrder === 'shuffled' ? 'active' : ''} onClick={onShuffle}>
            Shuffle
          </button>
        </div>
        <div className="atlas-view-controls">
          <label>
            <span>Cell</span>
            <input
              type="number"
              min={72}
              max={220}
              value={atlasCellSize}
              onChange={(event) => onAtlasCellSizeChange(clampNumber(Number(event.target.value), 72, 220))}
            />
          </label>
          <label className="check-row compact-check">
            <input type="checkbox" checked={showLabels} onChange={(event) => onLabelsChange(event.target.checked)} />
            <span>Labels</span>
          </label>
        </div>
        <div className="atlas-page-controls">
          <button type="button" onClick={onPrevious} disabled={atlasPage === 0n}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={onNext} disabled={atlasPage >= atlasPageCount - 1n}>
            <ChevronRight size={16} />
          </button>
          <button type="button" onClick={onOpen}>
            <Maximize2 size={16} />
            Open
          </button>
        </div>
      </div>
    </div>
  )
}

type AtlasWindowProps = {
  atlasOrder: AtlasOrder
  atlasCellSize: number
  atlasLayout: AtlasLayout
  atlasPage: bigint
  atlasPageCount: bigint
  digitsPerGlyph: number
  fill: string
  pageSummary: AtlasPageSummary
  showLabels: boolean
  totalCount: bigint
  onAtlasCellSizeChange: (value: number) => void
  onAtlasPageInputCommit: (value: string) => void
  onClose: () => void
  onLabelsChange: (value: boolean) => void
  onNext: () => void
  onPrevious: () => void
  onOrdered: () => void
  onShuffle: () => void
}

function AtlasWindow({
  atlasOrder,
  atlasCellSize,
  atlasLayout,
  atlasPage,
  atlasPageCount,
  digitsPerGlyph,
  fill,
  pageSummary,
  showLabels,
  totalCount,
  onAtlasCellSizeChange,
  onAtlasPageInputCommit,
  onClose,
  onLabelsChange,
  onNext,
  onPrevious,
  onOrdered,
  onShuffle,
}: AtlasWindowProps) {
  const slotStart = toPaddedOctal(pageSummary.startSlot, digitsPerGlyph)
  const slotEnd = toPaddedOctal(pageSummary.endSlot, digitsPerGlyph)
  const atlasGridStyle = {
    '--atlas-cell-size': `${atlasCellSize}px`,
    '--atlas-columns': atlasLayout.columns,
    '--atlas-gap': `${ATLAS_GAP}px`,
  } as CSSProperties

  return (
    <div className="atlas-overlay" role="presentation" onClick={onClose}>
      <section
        className="atlas-window"
        role="dialog"
        aria-modal="true"
        aria-label="Glyph atlas"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="atlas-header">
          <div className="atlas-header-copy">
            <h2>Glyph Atlas</h2>
            <p>
              {atlasLayout.columns} by {atlasLayout.rows} page grid over {formatBigInt(totalCount)} values with {digitsPerGlyph}-digit octal glyphs.
            </p>
          </div>
          <div className="atlas-header-actions">
            <div className="atlas-view-controls">
              <label>
                <span>Cell</span>
                <input
                  type="number"
                  min={72}
                  max={220}
                  value={atlasCellSize}
                  onChange={(event) => onAtlasCellSizeChange(clampNumber(Number(event.target.value), 72, 220))}
                />
              </label>
              <label className="check-row compact-check">
                <input type="checkbox" checked={showLabels} onChange={(event) => onLabelsChange(event.target.checked)} />
                <span>Labels</span>
              </label>
            </div>
            <div className="atlas-order-switch">
              <button type="button" className={atlasOrder === 'ordered' ? 'active' : ''} onClick={onOrdered}>
                Ordered
              </button>
              <button type="button" className={atlasOrder === 'shuffled' ? 'active' : ''} onClick={onShuffle}>
                <Shuffle size={15} />
                Shuffle
              </button>
            </div>
            <div className="atlas-page-controls">
              <button type="button" onClick={onPrevious} disabled={atlasPage === 0n} aria-label="Previous atlas page">
                <ChevronLeft size={16} />
              </button>
              <label className="atlas-page-input">
                <span>Page</span>
                <input
                  key={atlasPage.toString()}
                  defaultValue={(atlasPage + 1n).toString()}
                  onBlur={(event) => onAtlasPageInputCommit(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      onAtlasPageInputCommit(event.currentTarget.value)
                    }
                  }}
                  inputMode="numeric"
                  spellCheck={false}
                />
              </label>
              <span className="atlas-page-total">/ {formatBigInt(atlasPageCount)}</span>
              <button
                type="button"
                onClick={onNext}
                disabled={atlasPage >= atlasPageCount - 1n}
                aria-label="Next atlas page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <button type="button" className="atlas-close-button" onClick={onClose} aria-label="Close atlas">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="atlas-info-bar">
          <span>Page {formatBigInt(atlasPage + 1n)} of {formatBigInt(atlasPageCount)}</span>
          <span>{pageSummary.cellCount} glyphs on screen</span>
          <span>{atlasOrder === 'ordered' ? `Values ${slotStart} to ${slotEnd}` : `Shuffled slots ${slotStart} to ${slotEnd}`}</span>
        </div>

        <div className="atlas-grid-wrap">
          <div className={`atlas-grid ${showLabels ? '' : 'labels-hidden'}`} style={atlasGridStyle}>
            {pageSummary.cells.map((cell, index) =>
              cell ? (
                <article className="atlas-cell" key={cell.slot.toString()} title={`${cell.value} (slot ${cell.slot.toString(8)})`}>
                  <svg viewBox={cell.render.viewBox} role="img" aria-label={`Glyph ${cell.value}`}>
                    <path d={cell.render.path} fill={fill} fillRule="evenodd" />
                  </svg>
                  <span className="atlas-cell-value">{cell.value}</span>
                  <span className="atlas-cell-slot">{toPaddedOctal(cell.slot, digitsPerGlyph)}</span>
                </article>
              ) : (
                <div className="atlas-cell atlas-cell-empty" key={`empty-${index}`} aria-hidden="true" />
              ),
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

type EditorCanvasProps = {
  font: GlyphFont
  mode: EditorMode
  selectedDigit: DigitKey
  selectedArmPoint: number
  selectedCoreLayer: CoreLayer
  selectedCorePoint: number
  selectedSocket: SocketEndpoint
  gridSize: number
  gridMode: GridMode
  snapToGrid: boolean
  onArmPointChange: (index: number, point: Point) => void
  onCorePointChange: (layer: CoreLayer, index: number, point: Point) => void
  onSocketChange: (endpoint: SocketEndpoint, point: Point) => void
  onSelectArmPoint: (index: number) => void
  onSelectCoreLayer: (layer: CoreLayer) => void
  onSelectCorePoint: (index: number) => void
  onSelectSocket: (endpoint: SocketEndpoint) => void
}

function EditorCanvas({
  font,
  mode,
  selectedDigit,
  selectedArmPoint,
  selectedCoreLayer,
  selectedCorePoint,
  selectedSocket,
  gridSize,
  gridMode,
  snapToGrid,
  onArmPointChange,
  onCorePointChange,
  onSocketChange,
  onSelectArmPoint,
  onSelectCoreLayer,
  onSelectCorePoint,
  onSelectSocket,
}: EditorCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null)
  const activeArm = alignArmEndpoints(font, font.arms[selectedDigit])
  const gridLines = useMemo(() => createGridLines(gridSize, gridMode), [gridSize, gridMode])
  const corePreviewPath = pointsToPath([font.core.polygon, ...font.core.holes])
  const socketCopies = Array.from({ length: font.core.digitsPerGlyph }, (_, socketIndex) => {
    const rotation = socketIndex * font.core.rotationStepDeg
    return {
      start: rotatePoint(font.core.socketStart, rotation, font.core.origin),
      end: rotatePoint(font.core.socketEnd, rotation, font.core.origin),
    }
  })

  function pointerToPoint(event: ReactPointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) {
      return null
    }

    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const transformed = point.matrixTransform(matrix.inverse())
    return snapPoint({ x: transformed.x, y: transformed.y }, gridSize, gridMode, snapToGrid)
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragTarget) {
      return
    }

    const point = pointerToPoint(event)
    if (!point) {
      return
    }

    if (dragTarget.kind === 'arm') {
      onArmPointChange(dragTarget.index, point)
    }
    if (dragTarget.kind === 'core') {
      onCorePointChange(dragTarget.layer, dragTarget.index, point)
    }
    if (dragTarget.kind === 'socket') {
      onSocketChange(dragTarget.endpoint, point)
    }
  }

  function startDrag(event: ReactPointerEvent<SVGElement>, target: DragTarget) {
    event.preventDefault()
    svgRef.current?.setPointerCapture(event.pointerId)
    setDragTarget(target)
  }

  function stopDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (dragTarget) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragTarget(null)
  }

  return (
    <svg
      ref={svgRef}
      className="editor-canvas"
      viewBox={`${-VIEWBOX_EXTENT} ${-VIEWBOX_EXTENT} ${VIEWBOX_EXTENT * 2} ${VIEWBOX_EXTENT * 2}`}
      role="img"
      aria-label="Editable glyph geometry"
      onPointerMove={handlePointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    >
      <g className="grid-layer" aria-hidden="true">
        {gridLines.map((line) => (
          <line
            key={`${line.x1}-${line.y1}-${line.x2}-${line.y2}`}
            className={line.major ? 'major' : ''}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
          />
        ))}
      </g>

      <g className="axis-layer" aria-hidden="true">
        <line x1={-VIEWBOX_EXTENT} y1={0} x2={VIEWBOX_EXTENT} y2={0} />
        <line x1={0} y1={-VIEWBOX_EXTENT} x2={0} y2={VIEWBOX_EXTENT} />
      </g>

      <path className="core-fill" d={corePreviewPath} fillRule="evenodd" />
      <polygon className="core-outline" points={pointsToSvg(font.core.polygon)} />
      {font.core.holes.map((hole, index) => (
        <polygon key={index} className="core-hole-outline" points={pointsToSvg(hole)} />
      ))}

      {socketCopies.map((socket, index) => (
        <line
          key={`${socket.start.x}-${socket.end.x}-${index}`}
          className={index === 0 ? 'socket-line primary' : 'socket-line'}
          x1={socket.start.x}
          y1={socket.start.y}
          x2={socket.end.x}
          y2={socket.end.y}
        />
      ))}

      {mode === 'arms' && (
        <g className="arm-layer">
          {activeArm.length >= 3 && <polygon className="arm-fill" points={pointsToSvg(activeArm)} />}
          <polyline className="arm-line" points={pointsToSvg(activeArm)} />
          {activeArm.map((point, index) => {
            const locked = index === 0 || index === activeArm.length - 1
            return (
              <circle
                key={`${index}-${point.x}-${point.y}`}
                className={[
                  'handle',
                  locked ? 'locked' : '',
                  index === selectedArmPoint ? 'selected' : '',
                ].join(' ')}
                cx={point.x}
                cy={point.y}
                r={locked ? 2.5 : 2.5}
                onPointerDown={(event) => {
                  onSelectArmPoint(index)
                  if (!locked) {
                    startDrag(event, { kind: 'arm', index })
                  }
                }}
              />
            )
          })}
        </g>
      )}

      {mode === 'core' && (
        <g className="core-edit-layer">
          {font.core.polygon.map((point, index) => (
            <circle
              key={`${index}-${point.x}-${point.y}`}
              className={[
                'handle',
                'core-handle',
                selectedCoreLayer === 'outer' && index === selectedCorePoint ? 'selected' : '',
              ].join(' ')}
              cx={point.x}
              cy={point.y}
              r={2.5}
              onPointerDown={(event) => {
                onSelectCoreLayer('outer')
                onSelectCorePoint(index)
                startDrag(event, { kind: 'core', layer: 'outer', index })
              }}
            />
          ))}
          {font.core.holes[0]?.map((point, index) => (
            <circle
              key={`hole-${index}-${point.x}-${point.y}`}
              className={[
                'handle',
                'hole-handle',
                selectedCoreLayer === 'hole' && index === selectedCorePoint ? 'selected' : '',
              ].join(' ')}
              cx={point.x}
              cy={point.y}
              r={2.5}
              onPointerDown={(event) => {
                onSelectCoreLayer('hole')
                onSelectCorePoint(index)
                startDrag(event, { kind: 'core', layer: 'hole', index })
              }}
            />
          ))}
          <circle
            className={['handle', 'socket-handle', selectedSocket === 'start' ? 'selected' : ''].join(' ')}
            cx={font.core.socketStart.x}
            cy={font.core.socketStart.y}
            r={3}
            onPointerDown={(event) => {
              onSelectSocket('start')
              startDrag(event, { kind: 'socket', endpoint: 'start' })
            }}
          />
          <circle
            className={['handle', 'socket-handle', selectedSocket === 'end' ? 'selected' : ''].join(' ')}
            cx={font.core.socketEnd.x}
            cy={font.core.socketEnd.y}
            r={3}
            onPointerDown={(event) => {
              onSelectSocket('end')
              startDrag(event, { kind: 'socket', endpoint: 'end' })
            }}
          />
        </g>
      )}
    </svg>
  )
}

type PointListProps = {
  points: Point[]
  selectedIndex: number
  lockedIndexes?: number[]
  onSelect: (index: number) => void
}

function PointList({ points, selectedIndex, lockedIndexes = [], onSelect }: PointListProps) {
  return (
    <div className="point-list">
      {points.map((point, index) => (
        <button
          type="button"
          key={`${index}-${point.x}-${point.y}`}
          className={index === selectedIndex ? 'active' : ''}
          onClick={() => onSelect(index)}
        >
          <span>{index}</span>
          <span>{formatCoord(point.x)}</span>
          <span>{formatCoord(point.y)}</span>
          {lockedIndexes.includes(index) && <span className="lock-dot" aria-label="Socket endpoint" />}
        </button>
      ))}
    </div>
  )
}

type CoordinateInputsProps = {
  point: Point
  disabled?: boolean
  onChange: (point: Point) => void
}

function CoordinateInputs({ point, disabled = false, onChange }: CoordinateInputsProps) {
  return (
    <div className="coord-grid">
      <label>
        <span>X</span>
        <input
          type="number"
          value={formatInputNumber(point.x)}
          disabled={disabled}
          onChange={(event) => onChange({ ...point, x: Number(event.target.value) })}
        />
      </label>
      <label>
        <span>Y</span>
        <input
          type="number"
          value={formatInputNumber(point.y)}
          disabled={disabled}
          onChange={(event) => onChange({ ...point, y: Number(event.target.value) })}
        />
      </label>
    </div>
  )
}

type IconButtonProps = {
  title: string
  disabled?: boolean
  children: ReactNode
  onClick: () => void
}

function IconButton({ title, disabled = false, children, onClick }: IconButtonProps) {
  return (
    <button type="button" className="icon-button" title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

function ensureCoreHole(font: GlyphFont) {
  font.core.holes[0] = font.core.holes[0] ?? structuredClone(DEFAULT_CORE_HOLE)
  return font.core.holes[0]
}

function buildAtlasPage(
  font: GlyphFont,
  page: bigint,
  totalCount: bigint,
  pageSizeNumber: number,
  shuffled: boolean,
  seed: number,
): AtlasPageSummary {
  const pageSize = BigInt(pageSizeNumber)
  const safePage = clampAtlasPage(page, (totalCount + pageSize - 1n) / pageSize)
  const startSlot = safePage * pageSize
  const endExclusive = minBigInt(totalCount, startSlot + pageSize)
  const cellCount = Number(endExclusive - startSlot)
  const cells: Array<AtlasCell | null> = []

  for (let cellIndex = 0; cellIndex < pageSizeNumber; cellIndex += 1) {
    const slot = startSlot + BigInt(cellIndex)
    if (slot >= totalCount) {
      cells.push(null)
      continue
    }

    const valueIndex = shuffled ? permuteAtlasIndex(slot, totalCount, seed) : slot
    const value = toPaddedOctal(valueIndex, font.core.digitsPerGlyph)
    cells.push({
      slot,
      value,
      render: buildGlyphRender(font, value),
    })
  }

  return {
    cells,
    startSlot,
    endSlot: cellCount > 0 ? endExclusive - 1n : startSlot,
    cellCount,
  }
}

function createGridLines(gridSize: number, mode: GridMode) {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number; major: boolean }> = []

  if (mode === 'triangular') {
    const height = triangularGridHeight(gridSize)
    const maxRow = Math.ceil(VIEWBOX_EXTENT / height)
    const maxDiagonalIndex = Math.ceil((VIEWBOX_EXTENT * (1 + TRIANGLE_SLOPE)) / (TRIANGLE_SLOPE * gridSize))

    for (let row = -maxRow; row <= maxRow; row += 1) {
      const y = row * height
      lines.push({ x1: -VIEWBOX_EXTENT, y1: y, x2: VIEWBOX_EXTENT, y2: y, major: Math.abs(row) % 5 === 0 })
    }

    for (let index = -maxDiagonalIndex; index <= maxDiagonalIndex; index += 1) {
      const offset = index * TRIANGLE_SLOPE * gridSize
      const major = Math.abs(index) % 5 === 0
      const risingLine = lineSegmentFromEquation(-TRIANGLE_SLOPE, 1, offset)
      const fallingLine = lineSegmentFromEquation(TRIANGLE_SLOPE, 1, offset)
      if (risingLine) {
        lines.push({ ...risingLine, major })
      }
      if (fallingLine) {
        lines.push({ ...fallingLine, major })
      }
    }

    return lines
  }

  const limit = mode === 'diagonal' ? VIEWBOX_EXTENT * 2 : VIEWBOX_EXTENT
  for (let position = -limit; position <= limit; position += gridSize) {
    const major = Math.abs(Math.round(position / gridSize)) % 5 === 0

    if (mode === 'square') {
      lines.push(
        { x1: position, y1: -VIEWBOX_EXTENT, x2: position, y2: VIEWBOX_EXTENT, major },
        { x1: -VIEWBOX_EXTENT, y1: position, x2: VIEWBOX_EXTENT, y2: position, major },
      )
    } else {
      const sumLine = diagonalGridSegment('sum', position)
      const diffLine = diagonalGridSegment('diff', position)
      if (sumLine) {
        lines.push({ ...sumLine, major })
      }
      if (diffLine) {
        lines.push({ ...diffLine, major })
      }
    }
  }

  return lines
}

function snapPoint(point: Point, gridSize: number, mode: GridMode, enabled: boolean): Point {
  if (!enabled) {
    return {
      x: roundForEdit(point.x),
      y: roundForEdit(point.y),
    }
  }

  if (mode === 'diagonal') {
    const snappedSum = Math.round((point.x + point.y) / gridSize) * gridSize
    const snappedDiff = Math.round((point.x - point.y) / gridSize) * gridSize
    return {
      x: roundForEdit((snappedSum + snappedDiff) / 2),
      y: roundForEdit((snappedSum - snappedDiff) / 2),
    }
  }

  if (mode === 'triangular') {
    return nearestTriangularGridPoint(point, gridSize)
  }

  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  }
}

function pointsToPath(rings: Point[][]) {
  return rings
    .filter((ring) => ring.length >= 3)
    .map((ring) =>
      ring
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${formatPathNumber(point.x)},${formatPathNumber(point.y)}`)
        .join(' ')
        .concat(' Z'),
    )
    .join(' ')
}

function diagonalGridSegment(kind: 'sum' | 'diff', offset: number) {
  const candidates: Point[] = []
  const addCandidate = (point: Point) => {
    const withinBounds =
      point.x >= -VIEWBOX_EXTENT &&
      point.x <= VIEWBOX_EXTENT &&
      point.y >= -VIEWBOX_EXTENT &&
      point.y <= VIEWBOX_EXTENT
    const unique = candidates.every((candidate) => candidate.x !== point.x || candidate.y !== point.y)
    if (withinBounds && unique) {
      candidates.push(point)
    }
  }

  if (kind === 'sum') {
    addCandidate({ x: -VIEWBOX_EXTENT, y: offset + VIEWBOX_EXTENT })
    addCandidate({ x: VIEWBOX_EXTENT, y: offset - VIEWBOX_EXTENT })
    addCandidate({ x: offset + VIEWBOX_EXTENT, y: -VIEWBOX_EXTENT })
    addCandidate({ x: offset - VIEWBOX_EXTENT, y: VIEWBOX_EXTENT })
  } else {
    addCandidate({ x: -VIEWBOX_EXTENT, y: -VIEWBOX_EXTENT - offset })
    addCandidate({ x: VIEWBOX_EXTENT, y: VIEWBOX_EXTENT - offset })
    addCandidate({ x: offset - VIEWBOX_EXTENT, y: -VIEWBOX_EXTENT })
    addCandidate({ x: offset + VIEWBOX_EXTENT, y: VIEWBOX_EXTENT })
  }

  const [start, end] = candidates
  if (!start || !end) {
    return null
  }

  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
}

const TRIANGLE_SLOPE = Math.sqrt(3)

function triangularGridHeight(gridSize: number) {
  return (gridSize * TRIANGLE_SLOPE) / 2
}

function nearestTriangularGridPoint(point: Point, gridSize: number) {
  const height = triangularGridHeight(gridSize)
  const fractionalJ = point.y / height
  const fractionalI = (point.x - (fractionalJ * gridSize) / 2) / gridSize
  let nearest = { x: 0, y: 0 }
  let nearestDistance = Number.POSITIVE_INFINITY

  for (let i = Math.floor(fractionalI) - 2; i <= Math.ceil(fractionalI) + 2; i += 1) {
    for (let j = Math.floor(fractionalJ) - 2; j <= Math.ceil(fractionalJ) + 2; j += 1) {
      const candidate = {
        x: i * gridSize + (j * gridSize) / 2,
        y: j * height,
      }
      const distance = (point.x - candidate.x) ** 2 + (point.y - candidate.y) ** 2
      if (distance < nearestDistance) {
        nearest = candidate
        nearestDistance = distance
      }
    }
  }

  return {
    x: roundForEdit(nearest.x),
    y: roundForEdit(nearest.y),
  }
}

function lineSegmentFromEquation(a: number, b: number, c: number) {
  const candidates: Point[] = []
  const addCandidate = (point: Point) => {
    const withinBounds =
      point.x >= -VIEWBOX_EXTENT - 0.001 &&
      point.x <= VIEWBOX_EXTENT + 0.001 &&
      point.y >= -VIEWBOX_EXTENT - 0.001 &&
      point.y <= VIEWBOX_EXTENT + 0.001
    const rounded = { x: roundForEdit(point.x), y: roundForEdit(point.y) }
    const unique = candidates.every((candidate) => candidate.x !== rounded.x || candidate.y !== rounded.y)
    if (withinBounds && unique) {
      candidates.push(rounded)
    }
  }

  if (b !== 0) {
    addCandidate({ x: -VIEWBOX_EXTENT, y: (c - a * -VIEWBOX_EXTENT) / b })
    addCandidate({ x: VIEWBOX_EXTENT, y: (c - a * VIEWBOX_EXTENT) / b })
  }
  if (a !== 0) {
    addCandidate({ x: (c - b * -VIEWBOX_EXTENT) / a, y: -VIEWBOX_EXTENT })
    addCandidate({ x: (c - b * VIEWBOX_EXTENT) / a, y: VIEWBOX_EXTENT })
  }

  const [start, end] = candidates
  if (!start || !end) {
    return null
  }

  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: roundForEdit((a.x + b.x) / 2),
    y: roundForEdit((a.y + b.y) / 2),
  }
}

function clampAtlasPage(page: bigint, pageCount: bigint) {
  if (pageCount <= 1n) {
    return 0n
  }

  if (page < 0n) {
    return 0n
  }

  if (page >= pageCount) {
    return pageCount - 1n
  }

  return page
}

function permuteAtlasIndex(index: bigint, totalCount: bigint, seed: number) {
  if (totalCount <= 1n) {
    return index
  }

  const nonce = BigInt(Math.max(1, seed))
  let multiplier = (11400714819323198485n + nonce * 4099n) % totalCount

  if (multiplier === 0n) {
    multiplier = 1n
  }
  if (multiplier % 2n === 0n) {
    multiplier = multiplier + 1n >= totalCount ? multiplier - 1n : multiplier + 1n
  }

  const offset = (6364136223846793005n * nonce + 1442695040888963407n) % totalCount
  return (index * multiplier + offset) % totalCount
}

function toPaddedOctal(value: bigint, digitsPerGlyph: number) {
  return value.toString(8).padStart(digitsPerGlyph, '0')
}

function parsePositiveInteger(value: string) {
  if (!/^\d+$/.test(value)) {
    return null
  }

  const parsed = BigInt(value)
  return parsed <= 0n ? 1n : parsed
}

function minBigInt(left: bigint, right: bigint) {
  return left < right ? left : right
}

function getInitialViewport() {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 760 }
  }

  return { width: window.innerWidth, height: window.innerHeight }
}

function calculateAtlasLayout(viewport: { width: number; height: number }, cellSize: number): AtlasLayout {
  const safeCellSize = clampNumber(cellSize, 72, 220)
  const availableWidth = Math.max(safeCellSize, viewport.width - 64)
  const availableHeight = Math.max(safeCellSize, viewport.height - 190)
  const columns = Math.max(1, Math.floor((availableWidth + ATLAS_GAP) / (safeCellSize + ATLAS_GAP)))
  const rows = Math.max(1, Math.floor((availableHeight + ATLAS_GAP) / (safeCellSize + ATLAS_GAP)))

  return {
    columns,
    rows,
    pageSize: columns * rows,
  }
}

function sanitizeDecimalInput(value: string) {
  return value.replace(/\D/g, '')
}

function octalToDecimalString(value: string) {
  const clean = sanitizeOctalInput(value)
  if (!clean) {
    return '0'
  }

  return BigInt(`0o${clean}`).toString(10)
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) {
    return min
  }
  return Math.max(min, Math.min(max, value))
}

function roundForEdit(value: number) {
  return Number.parseFloat(value.toFixed(2))
}

function formatCoord(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1)
}

function formatInputNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

function formatPathNumber(value: number) {
  return Number.parseFloat(value.toFixed(2)).toString()
}

function formatBigInt(value: bigint) {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export default App

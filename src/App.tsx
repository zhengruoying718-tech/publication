import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, Flag, RefreshCw, Hand, X, Cpu, BookOpen } from 'lucide-react';
import { generateArchivalFragment, synthesizeReconstruction } from './services/geminiService';

const DEPARTMENTS = [
  { name: 'digital print', color: '#3B82F6' },
  { name: 'printmaking', color: '#F4C430' },
  { name: 'swap shop', color: '#A855F7' }
];

type PopupType = 'number' | 'blank' | 'mine' | 'ghost' | 'summary' | 'flag';

interface PopupData {
  id: string;
  type: PopupType;
  title: string;
  body: string;
  footer?: string;
  x: number;
  y: number;
  zIndex: number;
  color?: string;
  fontSize?: string;
  blur?: string;
  stamp?: string;
}

type TileData = {
  row: number;
  col: number;
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  justFlagged: boolean;
  neighborMines: number;
  ghostDept: typeof DEPARTMENTS[0] | null;
  ghostStrength: number;
  glowGreen: boolean;
  inkSpread: boolean;
};

type LogEvent = {
  id: string;
  timestamp: string;
  title: string;
  body: string;
  isUnseenSummary?: boolean;
};

type RunState = {
  NUM_1: boolean;
  NUM_2: boolean;
  NUM_3: boolean;
  NUM_4: boolean;
  FLAG_PLACED: boolean;
  GHOST_FLAG_CLICKED: boolean;
};

const ROWS = 10;
const COLS = 10;
const MINES = 5;

const DraggablePopup: React.FC<{ data: PopupData, bringToFront: (id: string) => void }> = ({ data, bringToFront }) => {
  const [pos, setPos] = useState({ x: data.x, y: data.y });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number, startY: number, initialX: number, initialY: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    bringToFront(data.id);
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: pos.x,
      initialY: pos.y
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({
      x: dragRef.current.initialX + dx,
      y: dragRef.current.initialY + dy
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  let containerStyle: React.CSSProperties = {
    left: pos.x,
    top: pos.y,
    zIndex: data.zIndex,
    opacity: data.type === 'blank' ? 0.7 : 0.9,
    filter: data.blur ? `blur(${data.blur})` : 'none',
    borderColor: data.color || '#0f172a',
  };

  let titleStyle: React.CSSProperties = {
    backgroundColor: data.color || '#0f172a',
    color: '#fff',
  };

  let bodyStyle: React.CSSProperties = {
    fontSize: data.fontSize || '12px',
    lineHeight: '1.2',
  };

  return (
    <div 
      className={`fixed w-52 bg-white border-2 shadow-md flex flex-col ${data.type === 'mine' ? 'animate-shake border-red-600' : ''}`}
      style={containerStyle}
      onMouseDown={handleMouseDown}
    >
      <div 
        className="px-2 py-1 cursor-grab font-bold text-[10px] tracking-wider flex justify-between items-center select-none"
        style={titleStyle}
      >
        <span>{data.title}</span>
      </div>
      <div className="p-2 text-slate-800 whitespace-pre-line relative overflow-hidden" style={bodyStyle}>
        {data.stamp && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-3xl font-bold text-slate-900/15 animate-soft-fade pixel-font">
              {data.stamp}
            </span>
          </div>
        )}
        <span className="relative z-10 font-mono">{data.body}</span>
        {data.footer && (
          <div className="mt-1 text-[10px] text-slate-500 border-t border-slate-200 pt-1 relative z-10 font-mono">
            {data.footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [grid, setGrid] = useState<TileData[][]>([]);
  const [popups, setPopups] = useState<PopupData[]>([]);
  const [zIndexCounter, setZIndexCounter] = useState(10);
  const [time, setTime] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showCompletionBanner, setShowCompletionBanner] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [isSeeping, setIsSeeping] = useState(false);
  const [hasPlacedFlag, setHasPlacedFlag] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  const [networkLog, setNetworkLog] = useState<LogEvent[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisReport, setSynthesisReport] = useState<string | null>(null);
  const [showSynthesisModal, setShowSynthesisModal] = useState(false);

  const [runState, setRunState] = useState<RunState>({
    NUM_1: false,
    NUM_2: false,
    NUM_3: false,
    NUM_4: false,
    FLAG_PLACED: false,
    GHOST_FLAG_CLICKED: false
  });

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerActive) {
      interval = setInterval(() => {
        setTime(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive]);

  useEffect(() => {
    if (!hasPlacedFlag || isCompleted) return;
    
    const interval = setInterval(() => {
      setGrid(g => {
        const newGrid = [...g.map(row => [...row])];
        const validTiles = [];
        let ghostCount = 0;
        let dpCount = 0;
        let pmCount = 0;
        let swapCount = 0;
        
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (newGrid[r][c].ghostDept) {
              ghostCount++;
              if (newGrid[r][c].ghostDept?.name === 'digital print') dpCount++;
              if (newGrid[r][c].ghostDept?.name === 'printmaking') pmCount++;
              if (newGrid[r][c].ghostDept?.name === 'swap shop') swapCount++;
            }
            if (!newGrid[r][c].isMine && !newGrid[r][c].ghostDept && !newGrid[r][c].isFlagged && !newGrid[r][c].isRevealed) {
              validTiles.push({ r, c });
            }
          }
        }

        if (validTiles.length > 0 && ghostCount < 4) {
          const availableDepts = [];
          if (dpCount < 2) availableDepts.push(DEPARTMENTS[0]);
          if (pmCount < 2) availableDepts.push(DEPARTMENTS[1]);
          if (swapCount < 1) availableDepts.push(DEPARTMENTS[2]);

          if (availableDepts.length > 0) {
            const { r, c } = validTiles[Math.floor(Math.random() * validTiles.length)];
            newGrid[r][c].ghostDept = availableDepts[Math.floor(Math.random() * availableDepts.length)];
            newGrid[r][c].ghostStrength = Math.random() > 0.5 ? 0.9 : 0.5;
          }
        }
        return newGrid;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [hasPlacedFlag, isCompleted]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [networkLog]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 200);
  };

  const bringToFront = (id: string) => {
    setZIndexCounter(z => z + 1);
    setPopups(prev => prev.map(p => p.id === id ? { ...p, zIndex: zIndexCounter + 1 } : p));
  };

  const logEvent = useCallback((typeKey: string, title: string, body: string) => {
    setNetworkLog(prevLogs => {
      if (!prevLogs.some(log => log.id === typeKey)) {
        const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        let logTitle = title;
        let logBody = body.split('\n')[0]; // Take first line for terminal brevity
        
        if (typeKey.startsWith('num-')) {
          logTitle = `[POLICING INDEX ${typeKey.split('-')[1]}]`;
        } else if (typeKey === 'ghost') {
          logTitle = `[HANDOFF DETECTED]`;
        } else if (typeKey === 'flag') {
          logTitle = `[ARCHIVE TAG]`;
          logBody = 'Marked for reuse category.';
        } else if (typeKey === 'blank') {
          logTitle = `[REUSE LOOP]`;
          logBody = 'Offcuts sorted.';
        }

        return [...prevLogs, { id: typeKey, timestamp, title: logTitle, body: logBody }];
      }
      return prevLogs;
    });
  }, []);

  const addPopup = useCallback(async (type: PopupType, extra?: any) => {
    const id = Math.random().toString(36).substr(2, 9);
    const x = Math.max(280, Math.floor(Math.random() * (window.innerWidth - 260)));
    const y = Math.max(20, Math.floor(Math.random() * (window.innerHeight - 200)));
    
    setZIndexCounter(z => z + 1);
    const zIndex = zIndexCounter + 1;

    let popup: PopupData = { id, type, title: '', body: 'Reconstructing fragment...', x, y, zIndex };

    if (type === 'number') {
      const num = extra.num;
      popup.title = `POLICING INDEX: ${num}`;
      
      // Initial static text
      if (num === 1) {
        popup.body = 'Offcuts separated.\nReuse remains local.';
        popup.fontSize = '16px';
        popup.blur = '0px';
        setRunState(s => ({ ...s, NUM_1: true }));
      } else if (num === 2) {
        popup.body = 'Printed / white / coloured split.\nContamination monitored.';
        popup.fontSize = '14px';
        popup.blur = '0.5px';
        setRunState(s => ({ ...s, NUM_2: true }));
      } else if (num === 3) {
        popup.body = 'Cut plans minimise waste.\nBins supervised.';
        popup.fontSize = '12px';
        popup.blur = '1px';
        setRunState(s => ({ ...s, NUM_3: true }));
      } else if (num === 4) {
        popup.body = 'Manual redistribution active.\nBeyond this room, control fades.';
        popup.fontSize = '11px';
        popup.blur = '1.5px';
        setRunState(s => ({ ...s, NUM_4: true }));  
      } else {
        popup.body = 'Sorted by type/colour/print.\nContamination avoided.\nDistribution curated.\nActs as a redistribution hub.';
        popup.fontSize = '10px';
        popup.blur = '2px';
        setRunState(s => ({ ...s, NUM_4: true }));
      }
      
      // Async AI enhancement
      generateArchivalFragment('policing', `Index ${num}`).then(fragment => {
        setPopups(prev => prev.map(p => p.id === id ? { ...p, body: fragment } : p));
      });

      logEvent(`num-${num}`, popup.title, popup.body);
    } else if (type === 'blank') {
      popup.title = 'REUSE LOOP';
      popup.body = 'Offcuts sorted.\nSizes archived.\nAvailable for reuse.\nInternal circulation: strong.';
      
      generateArchivalFragment('reuse', 'Empty node').then(fragment => {
        setPopups(prev => prev.map(p => p.id === id ? { ...p, body: fragment } : p));
      });

      logEvent('blank', popup.title, popup.body);
    } else if (type === 'ghost') {
      const dept = extra.dept;
      popup.title = `${dept.name.toUpperCase()} HANDOFF`;
      popup.color = dept.color;
      if (dept.name === 'digital print') {
        popup.body = `Offcuts offered.\nTime to sort is limited.\nOnly partial transfer.`;
      } else if (dept.name === 'printmaking') {
        popup.body = `Too thick for machines.\nReturned / redirected.\nFit mismatch.`;
      } else if (dept.name === 'swap shop') {
        popup.body = `Material exchange attempted.\nTraceability lost in transfer.`;
      }

      generateArchivalFragment('handoff', `Department: ${dept.name}`).then(fragment => {
        setPopups(prev => prev.map(p => p.id === id ? { ...p, body: fragment } : p));
      });

      setRunState(s => ({ ...s, GHOST_FLAG_CLICKED: true }));
      logEvent('ghost', popup.title, popup.body);
    } else if (type === 'mine') {
      popup.title = 'SYSTEM FAILURE';
      popup.body = 'Data corruption detected.\nArchival node unstable.\nReconstruction halted.';
      
      generateArchivalFragment('failure', 'System crash').then(fragment => {
        setPopups(prev => prev.map(p => p.id === id ? { ...p, body: fragment } : p));
      });

      logEvent('mine', popup.title, popup.body);
    } else if (type === 'flag') {
      popup.title = 'ARCHIVE TAG ADDED';
      popup.body = 'Marked for reuse category.\nPaper kept visible.\nNo disposal yet.';
      setRunState(s => ({ ...s, FLAG_PLACED: true }));
      logEvent('flag', popup.title, popup.body);
    }

    setPopups(prev => [...prev, popup]);
  }, [zIndexCounter, logEvent]);

  const initializeGrid = useCallback(() => {
    let newGrid: TileData[][] = Array(ROWS).fill(null).map((_, r) =>
      Array(COLS).fill(null).map((_, c) => ({
        row: r,
        col: c,
        isMine: false,
        isRevealed: false,
        isFlagged: false,
        justFlagged: false,
        neighborMines: 0,
        ghostDept: null,
        ghostStrength: 1,
        glowGreen: false,
        inkSpread: false,
      }))
    );

    let minesPlaced = 0;
    while (minesPlaced < MINES) {
      const r = Math.floor(Math.random() * ROWS);
      const c = Math.floor(Math.random() * COLS);
      if (!newGrid[r][c].isMine) {
        newGrid[r][c].isMine = true;
        minesPlaced++;
      }
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const rand = Math.random();
        let num = 0;
        if (rand > 0.8) num = 4;
        else if (rand > 0.6) num = 3;
        else if (rand > 0.4) num = 2;
        else if (rand > 0.2) num = 1;
        newGrid[r][c].neighborMines = num;
      }
    }

    setGrid(newGrid);
    setPopups([]);
    setIsCompleted(false);
    setShowCompletionModal(false);
    setShowCompletionBanner(false);
    setTime(0);
    setTimerActive(false);
    setHasPlacedFlag(false);
    setClickCount(0);
    setNetworkLog([]);
    setIsSeeping(false);
    setRunState({
      NUM_1: false,
      NUM_2: false,
      NUM_3: false,
      NUM_4: false,
      FLAG_PLACED: false,
      GHOST_FLAG_CLICKED: false
    });
  }, []);

  useEffect(() => {
    initializeGrid();
  }, [initializeGrid]);

  const checkCompletion = (currentGrid: TileData[][]) => {
    let allRevealed = true;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!currentGrid[r][c].isRevealed) {
          allRevealed = false;
          break;
        }
      }
    }
    if (allRevealed && !isCompleted) {
      setIsCompleted(true);
      setTimerActive(false);
      setIsSeeping(true);
      setTimeout(() => {
        setShowCompletionModal(true);
      }, 2000);
    }
  };

  const handleModalClose = () => {
    setShowCompletionModal(false);
    setShowCompletionBanner(true);

    const keyMap: Record<string, string> = {
      NUM_1: 'POLICING INDEX 1',
      NUM_2: 'POLICING INDEX 2',
      NUM_3: 'POLICING INDEX 3',
      NUM_4: 'POLICING INDEX 4',
      FLAG_PLACED: 'Archive Tag',
      GHOST_FLAG_CLICKED: 'Ghost Handoff'
    };

    const unseenKeys = Object.entries(runState)
      .filter(([_, seen]) => !seen)
      .map(([key]) => keyMap[key] || key);

    let summaryBody = '';
    if (unseenKeys.length === 0) {
      summaryBody = '> ALL TYPES DISCOVERED ✓';
    } else {
      summaryBody = `Unseen: ${unseenKeys.join(', ')}`;
    }

    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    setNetworkLog(prev => [
      ...prev,
      {
        id: 'unseen-summary',
        timestamp,
        title: '--- UNSEEN TYPES (REPLAY TO DISCOVER) ---',
        body: summaryBody,
        isUnseenSummary: true
      }
    ]);
  };

  const handleSynthesize = async () => {
    if (networkLog.length < 3) return;
    setIsSynthesizing(true);
    const logs = networkLog.map(l => `${l.title}: ${l.body}`);
    const report = await synthesizeReconstruction(logs);
    setSynthesisReport(report);
    setIsSynthesizing(false);
    setShowSynthesisModal(true);
  };

  const revealTile = (r: number, c: number) => {
    if (grid[r][c].isFlagged) return;
    if (!timerActive && !isCompleted) setTimerActive(true);

    setClickCount(prev => prev + 1);

    const newGrid = [...grid.map(row => [...row])];
    const tile = newGrid[r][c];

    if (tile.ghostDept) {
      addPopup('ghost', { dept: tile.ghostDept, strength: tile.ghostStrength });
    }

    if (tile.isRevealed) return;

    tile.isRevealed = true;

    if (tile.isMine) {
      tile.inkSpread = true;
      triggerShake();
      addPopup('mine');
    } else if (tile.neighborMines === 0) {
      tile.glowGreen = true;
      setTimeout(() => {
        setGrid(g => {
          const next = [...g.map(row => [...row])];
          if (next[r][c]) next[r][c].glowGreen = false;
          return next;
        });
      }, 1000);
      
      if (!tile.ghostDept) addPopup('blank');

      const queue = [[r, c]];
      while (queue.length > 0) {
        const [currR, currC] = queue.shift()!;
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            const nr = currR + i;
            const nc = currC + j;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              const neighbor = newGrid[nr][nc];
              if (!neighbor.isRevealed && !neighbor.isMine && !neighbor.isFlagged) {
                neighbor.isRevealed = true;
                if (neighbor.neighborMines === 0) {
                  queue.push([nr, nc]);
                }
              }
            }
          }
        }
      }
    } else {
      if (!tile.ghostDept) {
        addPopup('number', { num: tile.neighborMines });
      }
    }

    setGrid(newGrid);
    if (!tile.isMine) {
      checkCompletion(newGrid);
    }
  };

  const toggleFlag = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (grid[r][c].isRevealed) return;
    if (!timerActive && !isCompleted) setTimerActive(true);

    setClickCount(prev => prev + 1);

    const newGrid = [...grid.map(row => [...row])];
    const tile = newGrid[r][c];

    if (!tile.isFlagged) {
      tile.isFlagged = true;
      tile.justFlagged = true;
      setHasPlacedFlag(true);
      addPopup('flag');
      
      setTimeout(() => {
        setGrid(g => {
          const next = [...g.map(row => [...row])];
          if (next[r][c]) next[r][c].justFlagged = false;
          return next;
        });
      }, 1000);
    } else {
      tile.isFlagged = false;
    }

    setGrid(newGrid);
  };

  const getNumberColor = (num: number) => {
    return 'text-[#831843]';
  };

  const overlayOpacity = Math.min(clickCount * 0.015, 0.6);

  return (
    <div className={`min-h-screen bg-[#e8ecef] text-slate-800 font-sans flex flex-col lg:flex-row transition-transform ${isShaking ? 'animate-shake' : ''} overflow-hidden relative`}>
      <div 
        className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-500"
        style={{ backgroundColor: `rgba(0,0,0, ${overlayOpacity})` }}
      />
      <div 
        className={`fixed inset-0 pointer-events-none z-[60] transition-opacity duration-1000 flex items-center justify-center ${isSeeping ? 'animate-seepage' : 'opacity-0'}`}
      >
        {isSeeping && (
          <div className="absolute transform -rotate-12 text-6xl md:text-8xl font-black tracking-widest text-slate-500/30 border-8 border-slate-500/30 p-8 rounded-xl animate-soft-fade pixel-font">
            ARCHIVED
          </div>
        )}
      </div>

      {/* Network Log Panel - Left Terminal Style */}
      <div className="w-full lg:w-[260px] bg-[#111] border-r-2 border-slate-700 flex flex-col h-[300px] lg:h-screen shadow-2xl relative z-20 shrink-0 text-[#EC4899] font-mono">
        <div className="p-4 border-b border-slate-800 bg-[#1a1a1a]">
          <h2 className="text-sm font-bold tracking-widest text-[#EC4899]">NETWORK LOG</h2>
          <p className="text-[10px] text-[#EC4899]/70 mt-2 leading-relaxed">Reveal all tiles to reconstruct network dynamics.</p>
          {networkLog.length >= 3 && (
            <button 
              onClick={handleSynthesize}
              disabled={isSynthesizing}
              className="mt-4 w-full py-2 bg-[#EC4899] text-black text-[10px] font-bold tracking-widest hover:bg-[#F9A8D4] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSynthesizing ? <RefreshCw size={12} className="animate-spin" /> : <Cpu size={12} />}
              SYNTHESIZE RECONSTRUCTION
            </button>
          )}
        </div>
        <div ref={logContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2">
          {networkLog.length === 0 && (
            <div className="text-[10px] text-[#EC4899]/50 italic animate-pulse">&gt; Awaiting data stream...</div>
          )}
          {networkLog.map(log => (
            <div key={log.id} className={`text-[11px] leading-tight animate-in fade-in slide-in-from-left-2 duration-300 ${log.isUnseenSummary ? 'mt-4 pt-4 border-t border-[#EC4899]/50' : ''}`}>
              {!log.isUnseenSummary && <span className="text-[#EC4899]/50 mr-2">[{log.timestamp}]</span>}
              <span className={`text-[#EC4899] font-bold ${log.isUnseenSummary ? 'block mb-2' : ''}`}>{log.title}</span>
              <span className={`text-[#EC4899] ${log.isUnseenSummary ? 'block whitespace-pre-line' : 'ml-2'}`}>{log.body}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex-1 flex flex-col relative z-10 h-screen overflow-y-auto">
        {showCompletionBanner && (
          <div className="w-full bg-slate-900 text-white p-3 text-center border-b-2 border-[#EC4899] shadow-md animate-in slide-in-from-top-4 z-30 sticky top-0">
            <h3 className="text-sm font-bold tracking-widest mb-1">REUSE INTERNAL.</h3>
            <p className="text-xs font-mono text-slate-400">SOURCE EXTERNAL.</p>
            <p className="text-[10px] font-mono text-[#EC4899] mt-1">Replay to reveal missing nodes of the network.</p>
          </div>
        )}

        <div className="flex-1 flex justify-center items-start pt-12 px-4 lg:px-8 pb-12">
          <div className="max-w-2xl w-full">
            <header className="mb-8 border-b-2 border-slate-300 pb-4 flex justify-between items-end">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">PUBLICATION NODE</h1>
                <p className="text-sm text-slate-500 font-mono mt-1">SYSTEM COMPLEXITY INDEX // 2050 RECONSTRUCTION</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-slate-900 text-red-500 font-mono text-xl px-3 py-1 rounded border-2 border-slate-700 shadow-inner tracking-widest">
                  {formatTime(time)}
                </div>
                <button 
                  onClick={initializeGrid}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium rounded transition-colors"
                >
                  <RefreshCw size={16} />
                  RESET
                </button>
              </div>
            </header>

            <div className="frame">
              <div 
                className="grid" 
                style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
                onContextMenu={(e) => e.preventDefault()}
              >
                {grid.map((row, r) => row.map((tile, c) => {
                  
                  let content = null;
                  let cellClass = "tile flex items-center justify-center text-lg font-bold select-none transition-all duration-300 relative overflow-hidden ";
                  
                  if (tile.isRevealed) {
                    if (tile.isMine) {
                      cellClass += "bg-slate-900 text-white ";
                      content = (
                        <>
                          <AlertCircle size={20} className="text-rose-500 relative z-10" />
                          {tile.inkSpread && (
                            <div className="absolute w-full h-full bg-black rounded-full animate-ink pointer-events-none z-0" />
                          )}
                        </>
                      );
                    } else if (tile.neighborMines > 0) {
                      cellClass += "bg-slate-100 ";
                      if (tile.ghostDept) {
                        content = (
                          <div className="relative w-full h-full flex items-center justify-center">
                            <span className={getNumberColor(tile.neighborMines)}>{tile.neighborMines}</span>
                            <Hand size={16} className="absolute bottom-1 right-1" style={{ color: tile.ghostDept.color, opacity: tile.ghostStrength }} />
                          </div>
                        );
                      } else {
                        content = <span className={getNumberColor(tile.neighborMines)}>{tile.neighborMines}</span>;
                      }
                    } else {
                      cellClass += tile.glowGreen ? "bg-[#EC4899]/30 " : "bg-[#EC4899]/10 ";
                      if (tile.ghostDept) {
                        content = <Hand size={18} style={{ color: tile.ghostDept.color, opacity: tile.ghostStrength }} />;
                      }
                    }
                  } else {
                    cellClass += "bg-[#FBCFE8] hover:bg-[#F9A8D4] cursor-pointer ";
                    if (tile.isFlagged) {
                      cellClass += "!bg-slate-900 ";
                      if (tile.justFlagged) {
                        cellClass += "z-10 ";
                      }
                      content = (
                        <div className="flex flex-col items-center justify-center">
                          <Flag size={16} className="text-[#EC4899]" />
                          <span className="text-[6px] text-[#EC4899] leading-none mt-0.5">HELD</span>
                        </div>
                      );
                    } else if (tile.ghostDept) {
                      content = <Hand size={18} style={{ color: tile.ghostDept.color, opacity: tile.ghostStrength }} />;
                    }
                  }

                  return (
                    <div
                      key={`${r}-${c}`}
                      className={cellClass}
                      onClick={() => revealTile(r, c)}
                      onContextMenu={(e) => toggleFlag(e, r, c)}
                    >
                      {content}
                    </div>
                  );
                }))}
              </div>
            </div>

            <div className="mt-8 text-xs text-slate-500 font-mono flex justify-between">
              <span>LEFT CLICK: EXPLORE NODE</span>
              <span>RIGHT CLICK: PLACE ARCHIVE TAG</span>
            </div>
          </div>
        </div>
      </div>

      {popups.map(popup => (
        <DraggablePopup key={popup.id} data={popup} bringToFront={bringToFront} />
      ))}

      {showCompletionModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-500">
          <div className="max-w-md w-full p-6 border-2 border-slate-900 bg-white shadow-2xl relative">
            <button 
              onClick={handleModalClose}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-900 transition-colors"
            >
              <X size={20} />
            </button>
            <h2 className="text-lg font-bold tracking-widest mb-4 text-slate-900 border-b-2 border-[#EC4899] pb-2">SYSTEMIC OVERRIDE</h2>
            <p className="font-mono text-sm leading-relaxed mb-6 text-slate-700">
              Internal reuse strong.<br/>
              Final disposal beyond control.<br/>
              Recycling trust unstable.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={initializeGrid}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold tracking-wider transition-colors border border-slate-300"
              >
                RESTART
              </button>
              <button 
                onClick={handleModalClose}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold tracking-wider transition-colors"
              >
                ACKNOWLEDGE
              </button>
            </div>
          </div>
        </div>
      )}
      {showSynthesisModal && (
        <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-500">
          <div className="max-w-2xl w-full bg-[#111] border-2 border-[#EC4899] shadow-[0_0_30px_rgba(236,72,153,0.3)] p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#EC4899] to-transparent animate-pulse" />
            <button 
              onClick={() => setShowSynthesisModal(false)}
              className="absolute top-4 right-4 text-[#EC4899] hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
            
            <div className="flex items-center gap-4 mb-6">
              <BookOpen className="text-[#EC4899]" size={32} />
              <div>
                <h2 className="text-xl font-bold tracking-[0.2em] text-[#EC4899]">HISTORICAL RECONSTRUCTION REPORT</h2>
                <p className="text-[10px] text-[#EC4899]/50 font-mono">ARCHIVAL NODE SYNTHESIS // YEAR 2050</p>
              </div>
            </div>

            <div className="font-mono text-sm leading-relaxed text-[#EC4899]/90 whitespace-pre-line border-t border-[#EC4899]/20 pt-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {synthesisReport}
            </div>

            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => setShowSynthesisModal(false)}
                className="px-6 py-2 border border-[#EC4899] text-[#EC4899] text-xs font-bold tracking-widest hover:bg-[#EC4899] hover:text-black transition-all"
              >
                CLOSE ARCHIVE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

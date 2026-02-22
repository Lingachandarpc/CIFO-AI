'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type GameType = 'tic_tac_toe' | 'snake' | 'target_tap' | 'number_hunt' | 'memory_flip';

export interface GameConfig {
  type: GameType;
  title?: string;
  description?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

const CANVAS_SIZE = 280;
const SNAKE_GRID = 14;

type SnakeDirection = 'up' | 'down' | 'left' | 'right';
type SnakeCell = { x: number; y: number };

function parseDifficultyMultiplier(difficulty?: string) {
  if (difficulty === 'hard') return 1.4;
  if (difficulty === 'medium') return 1.1;
  return 1;
}

export default function NanobotGame({ config }: { config: GameConfig }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState('Tap Reset to start');
  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(false);

  const [board, setBoard] = useState<Array<'X' | 'O' | null>>(Array(9).fill(null));
  const [winner, setWinner] = useState<'X' | 'O' | 'DRAW' | null>(null);
  const [playerTurn, setPlayerTurn] = useState(true);

  const [target, setTarget] = useState({ x: 140, y: 140, r: 18 });
  const [timeLeft, setTimeLeft] = useState(20);
  const [snake, setSnake] = useState<SnakeCell[]>([]);
  const [snakeDirection, setSnakeDirection] = useState<SnakeDirection>('right');
  const [snakeFood, setSnakeFood] = useState<SnakeCell>({ x: 8, y: 8 });

  const [huntNumbers, setHuntNumbers] = useState<Array<{ n: number; x: number; y: number; hit: boolean }>>([]);
  const [nextNumber, setNextNumber] = useState(1);
  const [memoryCards, setMemoryCards] = useState<Array<{ value: number; open: boolean; matched: boolean }>>([]);
  const [memoryOpenIndexes, setMemoryOpenIndexes] = useState<number[]>([]);
  const [memoryMoves, setMemoryMoves] = useState(0);

  const title = config.title || (
    config.type === 'tic_tac_toe' 
      ? 'Tic-Tac-Toe'
      : config.type === 'snake'
        ? 'Snake'
      : config.type === 'target_tap'
        ? 'Target Tap'
        : config.type === 'number_hunt'
          ? 'Number Hunt'
          : 'Memory Flip'
  );

  const lineColor = useMemo(() => {
    if (typeof window === 'undefined') return '#9ca3af';
    return getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#9ca3af';
  }, []);

  const accentColor = useMemo(() => {
    if (typeof window === 'undefined') return '#ffffff';
    return getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim() || '#ffffff';
  }, []);

  const surfaceColor = useMemo(() => {
    if (typeof window === 'undefined') return '#111827';
    return getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#111827';
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    context.fillStyle = surfaceColor;
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    if (config.type === 'tic_tac_toe') {
      context.strokeStyle = lineColor;
      context.lineWidth = 2;
      for (let i = 1; i < 3; i++) {
        context.beginPath();
        context.moveTo((CANVAS_SIZE / 3) * i, 0);
        context.lineTo((CANVAS_SIZE / 3) * i, CANVAS_SIZE);
        context.stroke();

        context.beginPath();
        context.moveTo(0, (CANVAS_SIZE / 3) * i);
        context.lineTo(CANVAS_SIZE, (CANVAS_SIZE / 3) * i);
        context.stroke();
      }

      board.forEach((cell, index) => {
        if (!cell) return;
        const col = index % 3;
        const row = Math.floor(index / 3);
        const centerX = col * (CANVAS_SIZE / 3) + CANVAS_SIZE / 6;
        const centerY = row * (CANVAS_SIZE / 3) + CANVAS_SIZE / 6;

        context.strokeStyle = accentColor;
        context.fillStyle = accentColor;
        context.lineWidth = 4;

        if (cell === 'X') {
          context.beginPath();
          context.moveTo(centerX - 24, centerY - 24);
          context.lineTo(centerX + 24, centerY + 24);
          context.stroke();
          context.beginPath();
          context.moveTo(centerX + 24, centerY - 24);
          context.lineTo(centerX - 24, centerY + 24);
          context.stroke();
        } else {
          context.beginPath();
          context.arc(centerX, centerY, 26, 0, Math.PI * 2);
          context.stroke();
        }
      });
      return;
    }

    if (config.type === 'target_tap') {
      context.fillStyle = lineColor;
      context.font = '14px sans-serif';
      context.fillText(`Time: ${timeLeft}s`, 12, 22);
      context.fillText(`Score: ${score}`, 12, 42);

      context.fillStyle = accentColor;
      context.beginPath();
      context.arc(target.x, target.y, target.r, 0, Math.PI * 2);
      context.fill();
      return;
    }

    if (config.type === 'snake') {
      const cellSize = CANVAS_SIZE / SNAKE_GRID;
      context.strokeStyle = `${lineColor}55`;
      context.lineWidth = 1;

      for (let i = 0; i <= SNAKE_GRID; i++) {
        context.beginPath();
        context.moveTo(i * cellSize, 0);
        context.lineTo(i * cellSize, CANVAS_SIZE);
        context.stroke();

        context.beginPath();
        context.moveTo(0, i * cellSize);
        context.lineTo(CANVAS_SIZE, i * cellSize);
        context.stroke();
      }

      context.fillStyle = lineColor;
      context.font = '14px sans-serif';
      context.fillText(`Score: ${score}`, 10, 20);

      context.fillStyle = '#ef4444';
      context.fillRect(snakeFood.x * cellSize + 2, snakeFood.y * cellSize + 2, cellSize - 4, cellSize - 4);

      snake.forEach((segment, index) => {
        context.fillStyle = index === 0 ? accentColor : `${accentColor}cc`;
        context.fillRect(segment.x * cellSize + 2, segment.y * cellSize + 2, cellSize - 4, cellSize - 4);
      });
      return;
    }

    if (config.type === 'number_hunt') {
      context.fillStyle = lineColor;
      context.font = '14px sans-serif';
      context.fillText(`Next: ${nextNumber}`, 12, 22);
      context.fillText(`Score: ${score}`, 12, 42);

      context.font = '20px sans-serif';
      huntNumbers.forEach((item) => {
        context.fillStyle = item.hit ? lineColor : accentColor;
        context.fillText(String(item.n), item.x, item.y);
      });
      return;
    }

    const cols = 4;
    const rows = 3;
    const gap = 8;
    const cardW = (CANVAS_SIZE - gap * (cols + 1)) / cols;
    const cardH = (CANVAS_SIZE - 48 - gap * (rows + 1)) / rows;

    context.fillStyle = lineColor;
    context.font = '14px sans-serif';
    context.fillText(`Moves: ${memoryMoves}`, 12, 22);
    context.fillText(`Score: ${score}`, 12, 42);

    memoryCards.forEach((card, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = gap + col * (cardW + gap);
      const y = 48 + gap + row * (cardH + gap);

      context.fillStyle = card.matched ? `${lineColor}66` : surfaceColor;
      context.strokeStyle = lineColor;
      context.lineWidth = 1.5;
      context.fillRect(x, y, cardW, cardH);
      context.strokeRect(x, y, cardW, cardH);

      if (card.open || card.matched) {
        context.fillStyle = accentColor;
        context.font = '22px sans-serif';
        context.fillText(String(card.value), x + cardW / 2 - 6, y + cardH / 2 + 8);
      }
    });
  }, [accentColor, board, config.type, huntNumbers, lineColor, memoryCards, memoryMoves, nextNumber, score, snake, snakeFood, surfaceColor, target, timeLeft]);

  useEffect(() => {
    if (config.type !== 'memory_flip' || memoryOpenIndexes.length !== 2) return;

    const [firstIndex, secondIndex] = memoryOpenIndexes; 
    const first = memoryCards[firstIndex];
    const second = memoryCards[secondIndex];
    if (!first || !second) return;

    const timer = window.setTimeout(() => {
      setMemoryCards((prev) => {
        const updated = [...prev];
        if (updated[firstIndex].value === updated[secondIndex].value) {
          updated[firstIndex] = { ...updated[firstIndex], matched: true };
          updated[secondIndex] = { ...updated[secondIndex], matched: true };
          setScore((current) => current + 1);
          const allMatched = updated.every((card) => card.matched);
          if (allMatched) {
            setRunning(false);
            setStatus('Completed! Great memory run');
          } else {
            setStatus('Matched pair');
          }
        } else {
          updated[firstIndex] = { ...updated[firstIndex], open: false };
          updated[secondIndex] = { ...updated[secondIndex], open: false };
          setStatus('Try again');
        }
        return updated;
      });
      setMemoryOpenIndexes([]);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [config.type, memoryCards, memoryOpenIndexes]);

  useEffect(() => {
    if (config.type !== 'target_tap' || !running || timeLeft <= 0) return;

    const tick = window.setTimeout(() => { 
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setRunning(false);
          setStatus(`Time up! Final score: ${score}`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearTimeout(tick);
  }, [config.type, running, score, timeLeft]);

  useEffect(() => {
    if (config.type !== 'snake' || !running || snake.length === 0) return;

    const speed = config.difficulty === 'hard' ? 90 : config.difficulty === 'easy' ? 180 : 130;
    const tick = window.setTimeout(() => {
      setSnake((prev) => {
        if (!prev.length) return prev;
        const head = prev[0];
        const nextHead: SnakeCell = { ...head };
        if (snakeDirection === 'up') nextHead.y -= 1;
        if (snakeDirection === 'down') nextHead.y += 1;
        if (snakeDirection === 'left') nextHead.x -= 1;
        if (snakeDirection === 'right') nextHead.x += 1;

        const outOfBounds =
          nextHead.x < 0 ||
          nextHead.y < 0 ||
          nextHead.x >= SNAKE_GRID ||
          nextHead.y >= SNAKE_GRID;
        const hitSelf = prev.some((part) => part.x === nextHead.x && part.y === nextHead.y);
        if (outOfBounds || hitSelf) {
          setRunning(false);
          setStatus(`Game over! Score: ${score}`);
          return prev;
        }

        const ateFood = nextHead.x === snakeFood.x && nextHead.y === snakeFood.y;
        const nextSnake = [nextHead, ...prev];

        if (!ateFood) {
          nextSnake.pop();
          return nextSnake;
        }

        setScore((current) => current + 1);
        setStatus('Nice! Keep going');
        setSnakeFood(() => {
          const occupied = new Set(nextSnake.map((part) => `${part.x}-${part.y}`));
          let foodX = 0;
          let foodY = 0;
          do {
            foodX = Math.floor(Math.random() * SNAKE_GRID);
            foodY = Math.floor(Math.random() * SNAKE_GRID);
          } while (occupied.has(`${foodX}-${foodY}`));
          return { x: foodX, y: foodY };
        });

        return nextSnake;
      });
    }, speed);

    return () => window.clearTimeout(tick);
  }, [config.difficulty, config.type, running, score, snake.length, snakeDirection, snakeFood.x, snakeFood.y]);

  useEffect(() => {
    if (config.type !== 'target_tap' || !running || timeLeft <= 0) return;

    const speed = 900 / parseDifficultyMultiplier(config.difficulty);
    const moveTimer = window.setTimeout(() => {
      setTarget({
        x: 30 + Math.random() * (CANVAS_SIZE - 60),
        y: 50 + Math.random() * (CANVAS_SIZE - 70),
        r: 12 + Math.random() * 12,
      });
    }, speed);

    return () => window.clearTimeout(moveTimer);
  }, [config.difficulty, config.type, running, target, timeLeft]);

  const evaluateWinner = (nextBoard: Array<'X' | 'O' | null>) => {
    const winPatterns = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6],
    ];

    for (const [a, b, c] of winPatterns) {
      if (nextBoard[a] && nextBoard[a] === nextBoard[b] && nextBoard[b] === nextBoard[c]) {
        return nextBoard[a];
      }
    }

    if (nextBoard.every(Boolean)) return 'DRAW';
    return null;
  };

  const getStrategicMove = (nextBoard: Array<'X' | 'O' | null>) => {
    const empty = nextBoard
      .map((cell, index) => (cell ? null : index))
      .filter((value): value is number => value !== null);

    if (!empty.length) return -1;

    for (const index of empty) {
      const copy = [...nextBoard];
      copy[index] = 'O';
      if (evaluateWinner(copy) === 'O') return index;
    }

    for (const index of empty) {
      const copy = [...nextBoard];
      copy[index] = 'X';
      if (evaluateWinner(copy) === 'X') return index;
    }

    if (empty.includes(4)) return 4;
    const corners = [0, 2, 6, 8].filter((index) => empty.includes(index));
    if (corners.length) return corners[Math.floor(Math.random() * corners.length)];

    return empty[Math.floor(Math.random() * empty.length)];
  };

  const makeAiMove = (nextBoard: Array<'X' | 'O' | null>) => {
    const empty = nextBoard
      .map((cell, index) => (cell ? null : index))
      .filter((value): value is number => value !== null);

    if (!empty.length) return nextBoard;

    let aiIndex = empty[Math.floor(Math.random() * empty.length)];
    if (config.difficulty === 'hard') {
      aiIndex = getStrategicMove(nextBoard);
    } else if (config.difficulty === 'medium') {
      aiIndex = Math.random() < 0.65 ? getStrategicMove(nextBoard) : aiIndex;
    }

    if (aiIndex < 0 || !empty.includes(aiIndex)) {
      aiIndex = empty[Math.floor(Math.random() * empty.length)];
    }

    const updated = [...nextBoard];
    updated[aiIndex] = 'O';
    return updated;
  };

  const resetGame = useCallback(() => {
    if (config.type === 'tic_tac_toe') {
      setBoard(Array(9).fill(null));
      setWinner(null);
      setPlayerTurn(true);
      setStatus('Your turn (X)');
      setScore(0);
      return;
    }

    if (config.type === 'snake') {
      setSnake([
        { x: 7, y: 7 },
        { x: 6, y: 7 },
        { x: 5, y: 7 },
      ]);
      setSnakeDirection('right');
      setSnakeFood({ x: 9, y: 7 });
      setScore(0);
      setRunning(true);
      setStatus('Use arrow keys to play');
      return;
    }

    if (config.type === 'target_tap') {
      setScore(0);
      setTimeLeft(20);
      setRunning(true);
      setStatus('Tap the moving target');
      return;
    }

    if (config.type === 'memory_flip') {
      const pairs = [1, 2, 3, 4, 5, 6];
      const deck = [...pairs, ...pairs]
        .sort(() => Math.random() - 0.5)
        .map((value) => ({ value, open: false, matched: false }));

      setMemoryCards(deck);
      setMemoryOpenIndexes([]);
      setMemoryMoves(0);
      setScore(0);
      setRunning(true);
      setStatus('Match all pairs');
      return;
    }

    const nums = Array.from({ length: 9 }, (_, index) => ({
      n: index + 1,
      x: 20 + Math.random() * 220,
      y: 70 + Math.random() * 180,
      hit: false,
    }));

    setHuntNumbers(nums);
    setNextNumber(1);
    setScore(0);
    setRunning(true);
    setStatus('Tap numbers in order');
  }, [config.type]);

  useEffect(() => {
    if (config.type !== 'snake' || !running) return;

    const onKeyDown = (event: KeyboardEvent) => {
      setSnakeDirection((prev) => {
        const key = event.key.toLowerCase();
        if ((key === 'arrowup' || key === 'w') && prev !== 'down') return 'up';
        if ((key === 'arrowdown' || key === 's') && prev !== 'up') return 'down';
        if ((key === 'arrowleft' || key === 'a') && prev !== 'right') return 'left';
        if ((key === 'arrowright' || key === 'd') && prev !== 'left') return 'right';
        return prev;
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [config.type, running]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * CANVAS_SIZE;
    const y = ((event.clientY - rect.top) / rect.height) * CANVAS_SIZE;

    if (config.type === 'tic_tac_toe') {
      if (winner || !playerTurn) return;
      const col = Math.floor(x / (CANVAS_SIZE / 3));
      const row = Math.floor(y / (CANVAS_SIZE / 3));
      const cellIndex = row * 3 + col;

      if (board[cellIndex]) return;

      const playerBoard = [...board];
      playerBoard[cellIndex] = 'X';
      const playerResult = evaluateWinner(playerBoard);
      if (playerResult) {
        setBoard(playerBoard);
        setWinner(playerResult as 'X' | 'O' | 'DRAW');
        setStatus(playerResult === 'DRAW' ? 'Draw match' : `${playerResult} wins`);
        if (playerResult === 'X') setScore((prev) => prev + 1);
        return;
      }

      setPlayerTurn(false);
      setStatus('Nanobot thinking...');

      const aiBoard = makeAiMove(playerBoard);
      const aiResult = evaluateWinner(aiBoard);

      setBoard(aiBoard);
      if (aiResult) {
        setWinner(aiResult as 'X' | 'O' | 'DRAW');
        setStatus(aiResult === 'DRAW' ? 'Draw match' : `${aiResult} wins`);
      } else {
        setStatus('Your turn (X)');
      }
      setPlayerTurn(true);
      return;
    }

    if (config.type === 'snake') {
      return;
    }

    if (config.type === 'target_tap') {
      if (!running || timeLeft <= 0) return;
      const dx = x - target.x;
      const dy = y - target.y;
      if (dx * dx + dy * dy <= target.r * target.r) {
        setScore((prev) => prev + 1);
        setStatus('Great hit');
      }
      return;
    }

    if (config.type === 'memory_flip') {
      if (!running || memoryOpenIndexes.length >= 2) return;

      const cols = 4;
      const rows = 3;
      const gap = 8;
      const cardW = (CANVAS_SIZE - gap * (cols + 1)) / cols;
      const cardH = (CANVAS_SIZE - 48 - gap * (rows + 1)) / rows;

      const col = Math.floor((x - gap) / (cardW + gap));
      const row = Math.floor((y - 48 - gap) / (cardH + gap));
      if (col < 0 || col >= cols || row < 0 || row >= rows) return;

      const cardIndex = row * cols + col;
      const card = memoryCards[cardIndex];
      if (!card || card.open || card.matched) return;

      setMemoryCards((prev) => prev.map((item, index) => (index === cardIndex ? { ...item, open: true } : item)));
      setMemoryOpenIndexes((prev) => [...prev, cardIndex]);
      setMemoryMoves((prev) => prev + 1);
      setStatus('Find the matching pair');
      return;
    }

    if (!running) return;

    const updated = huntNumbers.map((item) => {
      if (item.hit || item.n !== nextNumber) return item;
      const withinX = Math.abs(item.x - x) <= 14;
      const withinY = Math.abs(item.y - y) <= 16;
      if (!withinX || !withinY) return item;
      return { ...item, hit: true };
    });

    const changed = updated.some((item, index) => item.hit !== huntNumbers[index]?.hit);
    if (!changed) return;

    setHuntNumbers(updated);
    setNextNumber((prev) => prev + 1);
    setScore((prev) => prev + 1);

    if (nextNumber >= 9) {
      setRunning(false);
      setStatus('Completed!');
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      resetGame();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [resetGame]);

  return (
    <div className="my-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[var(--foreground)]">{title}</h4>
        <button
          type="button"
          onClick={resetGame}
          className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-strong)] hover:text-[var(--foreground)]"
        >
          Reset
        </button>
      </div>
      {config.description && <p className="mb-2 text-xs text-[var(--muted)]">{config.description}</p>}
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        onClick={handleCanvasClick}
        className="mx-auto w-full max-w-[280px] rounded-lg border border-[var(--border)]"
      />
      {config.type === 'snake' && (
        <div className="mt-2 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setSnakeDirection((prev) => (prev === 'down' ? prev : 'up'))}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-strong)] hover:text-[var(--foreground)]"
          >
            Up
          </button>
          <button
            type="button"
            onClick={() => setSnakeDirection((prev) => (prev === 'right' ? prev : 'left'))}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-strong)] hover:text-[var(--foreground)]"
          >
            Left
          </button>
          <button
            type="button"
            onClick={() => setSnakeDirection((prev) => (prev === 'up' ? prev : 'down'))}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-strong)] hover:text-[var(--foreground)]"
          >
            Down
          </button>
          <button
            type="button"
            onClick={() => setSnakeDirection((prev) => (prev === 'left' ? prev : 'right'))}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-strong)] hover:text-[var(--foreground)]"
          >
            Right
          </button>
        </div>
      )}
      <p className="mt-2 text-xs text-[var(--muted)]">{status}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wider text-[var(--muted)]">Score: {score}</p>
    </div>
  );
}

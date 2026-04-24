"use client";
import { useState, useEffect, useRef } from 'react';
import Pusher from 'pusher-js';

export default function Home() {
  // --- 状態管理 ---
  const [userName, setUserName] = useState<string>("");
  const [hasEntered, setHasEntered] = useState(false);
  const [myId, setMyId] = useState<string>(""); 
  const [room, setRoom] = useState<string>("lobby");
  const [scores, setScores] = useState({ me: 0, op: 0 });
  const [opName, setOpName] = useState<string>("Opponent");
  const [streak, setStreak] = useState(0); 
  const [opStreak, setOpStreak] = useState(0); 
  const [status, setStatus] = useState("READY");
  const [isMatched, setIsMatched] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10);
  const [myHand, setMyHand] = useState<string | null>(null);

  // --- 参照管理 ---
  const myHandRef = useRef<string | null>(null);
  const opHandRef = useRef<string | null>(null);
  const isMatchedRef = useRef(false);
  const scoresRef = useRef({ me: 0, op: 0 });
  const streakRef = useRef({ me: 0, op: 0 });
  const lastSeenRef = useRef<number>(Date.now());

  const hands = [
    { name: 'rock', icon: '✊', label: 'グー' },
    { name: 'scissors', icon: '✌️', label: 'チョキ' },
    { name: 'paper', icon: '✋', label: 'パー' },
  ];

  // --- サウンドエフェクト ---
  const playSound = (type: 'win' | 'lose' | 'draw' | 'select' | 'count') => {
    const audio = new Audio(`/sounds/${type}.mp3`);
    audio.volume = 0.5;
    audio.play().catch(() => {});
  };

  // --- 通信関数 ---
  const broadcast = (type: string, extra = {}, forceId?: string) => {
    const id = forceId || myId;
    if (!id) return;
    fetch('/api/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        type, playerId: id, room, 
        userName: userName,
        currentScores: scoresRef.current,
        currentStreaks: streakRef.current,
        ...extra 
      }),
    }).catch((e) => console.error("Broadcast Error:", e));
  };

  // --- カウントダウンタイマー ---
  useEffect(() => {
    if (!isMatched || isWaiting || myHand || scores.me >= 10 || scores.op >= 10) return;
    if (timeLeft <= 0) { handleSelect("タイムアウト"); return; }

    const timer = setInterval(() => {
      if (timeLeft <= 4 && !myHand) playSound('count');
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isMatched, isWaiting, myHand, timeLeft, scores]);

  // --- Pusher接続 & マッチング ---
  useEffect(() => {
    if (!hasEntered) return;

    // 部屋名とIDの設定
    const params = new URLSearchParams(window.location.search);
    const roomName = params.get('room') || 'lobby';
    const newId = Math.random().toString(36).substring(7);
    
    setRoom(roomName);
    setMyId(newId);

    // Pusherの初期化
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY || '', {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || '',
    });

    const channel = pusher.subscribe(`janken-room-${roomName}`);

    // 自分の存在を知らせる
    broadcast('ping', {}, newId);

    channel.bind('opponent-move', (data: any) => {
      if (data.playerId === newId) return;
      lastSeenRef.current = Date.now();

      // 相手の情報をセット
      if (data.userName) setOpName(data.userName);
      
      if (!isMatchedRef.current) {
        setIsMatched(true);
        isMatchedRef.current = true;
        setStatus("BATTLE START");
      }

      // 生存確認への応答
      if (data.type === 'ping' || data.type === 'presence') {
        broadcast('presence', {}, newId);
      }

      // 切断検知
      if (data.type === 'i-disconnected') handleOpponentDisconnected();

      // スコア同期
      if (data.currentScores && data.currentStreaks) {
        const newScoreObj = { me: data.currentScores.op, op: data.currentScores.me };
        const newStreakObj = { me: data.currentStreaks.op, op: data.currentStreaks.me };
        setScores(newScoreObj);
        setStreak(newStreakObj.me);
        setOpStreak(newStreakObj.op);
        scoresRef.current = newScoreObj;
        streakRef.current = newStreakObj;
      }

      // 相手の手を受け取った
      if (data.type === 'move') {
        opHandRef.current = data.hand;
        checkResult();
      }
    });

    // 接続監視（2秒おきに信号を送る）
    const watchdog = setInterval(() => {
      if (isMatchedRef.current) {
        if (Date.now() - lastSeenRef.current > 8000) {
          handleOpponentDisconnected();
        } else {
          broadcast('presence', {}, newId);
        }
      } else {
        broadcast('ping', {}, newId);
      }
    }, 2000);

    return () => {
      clearInterval(watchdog);
      pusher.disconnect();
    };
  }, [hasEntered]);

  const handleOpponentDisconnected = () => {
    setIsMatched(false);
    isMatchedRef.current = false;
    setOpStreak(0);
    setStatus("ENEMY DISCONNECTED");
  };

  const checkResult = () => {
    const m = myHandRef.current;
    const o = opHandRef.current;
    if (!m || !o) return;

    const res = judge(m, o);
    if (res === 1) {
      scoresRef.current.me += 1;
      streakRef.current.me += 1;
      setStatus(streakRef.current.op >= 2 ? "STREAK BROKEN!" : "WIN");
      streakRef.current.op = 0;
      playSound('win');
    } else if (res === -1) {
      scoresRef.current.op += 1;
      streakRef.current.op += 1;
      streakRef.current.me = 0;
      setStatus("LOSE");
      playSound('lose');
    } else {
      setStatus("DRAW");
      playSound('draw');
    }

    setScores({...scoresRef.current});
    setStreak(streakRef.current.me);
    setOpStreak(streakRef.current.op);
    broadcast('sync-final');

    setTimeout(() => {
      if (scoresRef.current.me >= 10 || scoresRef.current.op >= 10) {
        setStatus(scoresRef.current.me >= 10 ? "VICTORY" : "DEFEAT");
        setTimeout(() => window.location.reload(), 4000);
      } else {
        myHandRef.current = null; opHandRef.current = null;
        setMyHand(null); setIsWaiting(false); setTimeLeft(10);
        setStatus("READY");
      }
    }, 1500);
  };

  const judge = (m: string, o: string) => {
    if (m === o) return 0;
    if (m === "タイムアウト") return -1;
    if (o === "タイムアウト") return 1;
    if ((m==="グー" && o==="チョキ") || (m==="チョキ" && o==="パー") || (m==="パー" && o==="グー")) return 1;
    return -1;
  };

  const handleSelect = (name: string) => {
    if (isWaiting || myHandRef.current || !isMatched) return;
    playSound('select');
    setIsWaiting(true);
    setMyHand(name);
    myHandRef.current = name;
    broadcast('move', { hand: name });
    checkResult();
  };

  // --- UI: 名前入力 ---
  if (!hasEntered) {
    return (
      <div className="h-dvh bg-slate-950 flex flex-col items-center justify-center p-6 text-white font-sans overflow-hidden">
        <div className="text-center mb-12">
          <h1 className="text-6xl font-black italic tracking-tighter bg-gradient-to-br from-cyan-400 to-blue-600 bg-clip-text text-transparent leading-none">STREAK<br/>JANKEN</h1>
          <p className="text-[10px] tracking-[0.6em] text-slate-500 mt-4 uppercase">Online Battle Arena</p>
        </div>
        <div className="w-full max-w-sm space-y-4">
          <input 
            type="text" 
            placeholder="ENTER YOUR NAME" 
            className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl px-6 py-5 text-center font-bold tracking-widest focus:border-cyan-500 outline-none transition-all uppercase text-lg"
            maxLength={10}
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
          <button 
            onClick={() => userName.trim() && setHasEntered(true)}
            className="w-full bg-white text-black font-black py-5 rounded-2xl active:scale-95 transition-all tracking-widest text-lg shadow-xl shadow-cyan-900/20"
          >
            ENTER ARENA
          </button>
        </div>
      </div>
    );
  }

  // --- UI: 対戦メイン ---
  return (
    <main className="flex flex-col h-dvh bg-slate-950 text-white font-sans overflow-hidden select-none relative">
      {/* マッチング待機オーバーレイ */}
      {!isMatched && (
        <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-slate-800 border-t-cyan-500 rounded-full animate-spin mb-6"></div>
          <p className="text-[12px] tracking-[0.4em] font-black text-cyan-500 uppercase animate-pulse">Searching in {room}...</p>
          <p className="text-[9px] text-slate-600 mt-4 uppercase tracking-widest">Waiting for opponent to join</p>
        </div>
      )}

      {/* 相手側セクション */}
      <div className="flex-1 flex flex-col items-center justify-center relative bg-gradient-to-b from-red-500/10 to-transparent">
        <div className="absolute top-6 flex flex-col items-center">
          <span className="text-[10px] font-bold tracking-widest opacity-40 uppercase mb-1">Opponent</span>
          <span className="text-base font-black tracking-tighter text-red-500 uppercase">{opName}</span>
        </div>
        <div 
          className={`text-[10rem] leading-none font-black tabular-nums transition-all duration-700 ${opStreak >= 3 ? 'text-red-500 scale-110' : 'text-white opacity-10'}`}
          style={{ filter: opStreak >= 3 ? `drop-shadow(0 0 20px rgba(239, 68, 68, 0.8))` : 'none' }}
        >
          {scores.op}
        </div>
        {opStreak >= 2 && (
          <div className="absolute bottom-4 animate-bounce bg-red-600 px-4 py-1 rounded-full text-[10px] font-black italic shadow-lg">
             WIN STREAK: {opStreak}
          </div>
        )}
      </div>

      {/* センター情報バー */}
      <div className="h-32 flex flex-col items-center justify-center border-y border-white/5 bg-black/40 z-10 shadow-2xl relative">
        <div className={`text-6xl font-black tabular-nums leading-none ${timeLeft <= 3 && !myHand ? 'text-red-500 animate-pulse' : 'text-white'}`}>
          {myHand ? "OK!" : timeLeft}
        </div>
        <p className="text-[11px] font-black tracking-[0.5em] text-cyan-400 uppercase mt-2">{status}</p>
      </div>

      {/* 自分側セクション */}
      <div className="flex-1 flex flex-col items-center justify-end relative bg-gradient-to-t from-cyan-500/10 to-transparent">
        <div className="absolute top-4 text-[10px] font-black tracking-widest text-cyan-500 opacity-60 uppercase">{userName}</div>
        
        <div 
          className={`text-[10rem] leading-none font-black tabular-nums transition-all mb-4 ${streak >= 3 ? 'text-cyan-400' : 'text-white'}`}
          style={{ filter: streak >= 3 ? `drop-shadow(0 0 30px rgba(34, 211, 238, 0.6))` : 'none' }}
        >
          {scores.me}
        </div>

        {streak >= 2 && (
          <div className="mb-6 text-cyan-400 text-[10px] font-black tracking-widest animate-pulse">
            🔥 {streak} WINS ON FIRE
          </div>
        )}
        
        {/* ボタンエリア (スマホでの押しやすさを最大化) */}
        <div className="flex w-full max-w-sm gap-4 px-6 pb-12 z-20">
          {hands.map((hand) => (
            <button
              key={hand.name}
              disabled={isWaiting || !isMatched}
              className={`
                flex-1 aspect-square flex flex-col items-center justify-center 
                bg-slate-900 border-2 border-white/10 rounded-[2rem] transition-all
                shadow-[0_8px_0_0_rgba(0,0,0,0.5)] active:shadow-none active:translate-y-2
                ${isWaiting ? 'opacity-20 grayscale scale-90' : 'hover:bg-slate-800 hover:border-cyan-500/50'}
              `}
              onClick={() => handleSelect(hand.label)}
            >
              <span className="text-4xl mb-1">{hand.icon}</span>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">{hand.name}</span>
            </button>
          ))}
        </div>
      </div>
      
      {/* 左右の戦況ゲージ */}
      <div className="absolute left-0 bottom-0 w-1.5 bg-cyan-500 transition-all duration-1000 shadow-[0_0_15px_#06b6d4]" style={{ height: `${(scores.me / 10) * 100}%` }} />
      <div className="absolute right-0 bottom-0 w-1.5 bg-red-500 transition-all duration-1000 shadow-[0_0_15px_#ef4444]" style={{ height: `${(scores.op / 10) * 100}%` }} />
    </main>
  );
}
import { NextResponse } from 'next/server';
import Pusher from 'pusher';

// 環境変数が無い場合にエラーを出すようにチェック
const appId = process.env.PUSHER_APP_ID;
const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
const secret = process.env.PUSHER_SECRET;
const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

if (!appId || !key || !secret || !cluster) {
  console.error("❌ Pusherの環境変数が設定されていません！ .env.local を確認してください。");
}

const pusher = new Pusher({
  appId: appId || "",
  key: key || "",
  secret: secret || "",
  cluster: cluster || "ap3",
  useTLS: true,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { hand, playerId, room, currentScore, type } = body;
    const channelName = `janken-room-${room || 'lobby'}`;

    console.log(`[Pusher Trigger] Room: ${channelName}, Type: ${type}, ID: ${playerId}`);

    await pusher.trigger(channelName, 'opponent-move', {
      hand: hand || null,
      playerId,
      score: currentScore || 0,
      type: type || 'move'
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    // ここで具体的なエラー内容をログに出す
    console.error("❌ Pusher API Error:", error.body || error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
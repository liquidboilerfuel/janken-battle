import { NextResponse } from 'next/server';
import Pusher from 'pusher';

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || "",
  key: process.env.NEXT_PUBLIC_PUSHER_KEY || "",
  secret: process.env.PUSHER_SECRET || "",
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap3",
  useTLS: true, // SSLを有効にする（重要）
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { room } = body;
    const channelName = `janken-room-${room || 'lobby'}`;

    // 受信したデータをそのまま相手に送る
    await pusher.trigger(channelName, 'opponent-move', body);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Pusher API Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
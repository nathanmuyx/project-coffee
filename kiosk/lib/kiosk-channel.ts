import { supabase } from "./supabase";

const CHANNEL_NAME = "kiosk-display";

export function getKioskChannel() {
  return supabase.channel(CHANNEL_NAME);
}

export function sendShowGcash() {
  supabase.channel(CHANNEL_NAME).send({
    type: "broadcast",
    event: "display",
    payload: { mode: "gcash_qr" },
  });
}

export function sendHideGcash() {
  supabase.channel(CHANNEL_NAME).send({
    type: "broadcast",
    event: "display",
    payload: { mode: "normal" },
  });
}

export function sendMenuRefresh() {
  supabase.channel(CHANNEL_NAME).send({
    type: "broadcast",
    event: "display",
    payload: { mode: "refresh_menu" },
  });
}

import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import type {
  ClientEvents,
  ServerEvents,
  Snapshot,
  Action,
  Config,
  Reply,
} from "@memeparty/shared";
interface State {
  id: string;
  nickname: string;
  state: Snapshot | null;
  connected: boolean;
  error: string;
  language: "de" | "en";
  offset: number;
  account: Account | null;
}
export interface Account {
  id: string;
  email: string;
  nickname: string;
  role: "USER" | "ADMIN";
}
export const useGame = create<State>(() => ({
  id: "",
  nickname: "",
  state: null,
  connected: false,
  error: "",
  language: localStorage.getItem("language") === "en" ? "en" : "de",
  offset: 0,
  account: null,
}));
let socket: Socket<ServerEvents, ClientEvents> | null = null;
export async function init() {
  const r = await fetch("/api/session");
  if (r.ok) {
    const user = (await r.json()) as { id: string; nickname: string };
    connect(user);
    await loadAccount();
  }
}
export async function loadAccount() {
  const response = await fetch("/api/account");
  useGame.setState({ account: response.ok ? ((await response.json()) as Account) : null });
}
async function accountRequest(path: "login" | "register", body: Record<string, string>) {
  const response = await fetch(`/api/accounts/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    throw Error(result.error ?? "INVALID_REQUEST");
  }
  await loadAccount();
}
export function loginAccount(email: string, password: string) {
  return accountRequest("login", { email, password });
}
export function registerAccount(email: string, password: string, nickname: string) {
  return accountRequest("register", { email, password, nickname });
}
export async function logoutAccount() {
  const response = await fetch("/api/accounts/logout", { method: "POST" });
  if (!response.ok) throw Error("INVALID_REQUEST");
  useGame.setState({ account: null });
}
export async function signIn(nickname: string) {
  const r = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
  if (!r.ok) throw Error("INVALID_REQUEST");
  connect((await r.json()) as { id: string; nickname: string });
}
function connect(user: { id: string; nickname: string }) {
  useGame.setState(user);
  if (socket) return;
  socket = io({
    transports: ["websocket"],
    withCredentials: true,
    reconnection: true,
  });
  socket.on("connect", () => {
    useGame.setState({ connected: true, error: "" });
    socket!.emit("lobby:restore", (reply) => {
      if (!reply.ok) useGame.setState({ error: reply.error });
    });
  });
  socket.on("disconnect", () => useGame.setState({ connected: false }));
  socket.on("connect_error", () => useGame.setState({ connected: false }));
  socket.on("lobby:state", (state) =>
    useGame.setState({ state, offset: state.serverTimestamp - Date.now() }),
  );
  socket.on("lobby:kicked", () =>
    useGame.setState({ state: null, error: "BANNED" }),
  );
}
function callback<T>(resolve: (data: T) => void, reject: (err: Error) => void) {
  return (reply: Reply<T>) => {
    if (reply.ok) {
      useGame.setState({ error: "" });
      resolve(reply.data);
    } else {
      useGame.setState({ error: reply.error });
      reject(Error(reply.error));
    }
  };
}
export function createLobby(name: string, config: Config) {
  return new Promise<{ code: string }>((resolve, reject) => {
    if (!socket?.connected) return reject(Error("OFFLINE"));
    socket
      .timeout(8000)
      .emit("lobby:create", { name, config }, (err, reply) =>
        err ? reject(Error("TIMEOUT")) : callback(resolve, reject)(reply),
      );
  });
}
export function joinLobby(code: string, inviteToken?: string) {
  return new Promise<{ code: string }>((resolve, reject) => {
    if (!socket?.connected) return reject(Error("OFFLINE"));
    socket
      .timeout(8000)
      .emit("lobby:join", { code, ...(inviteToken ? { inviteToken } : {}) }, (err, reply) =>
        err ? reject(Error("TIMEOUT")) : callback(resolve, reject)(reply),
      );
  });
}
export function leaveLobby() {
  return new Promise<void>((resolve, reject) => {
    if (!socket?.connected) return reject(Error("OFFLINE"));
    socket.timeout(8000).emit("lobby:leave", (err, reply) => {
      if (err) return reject(Error("TIMEOUT"));
      callback<void>(
        () => {
          useGame.setState({ state: null });
          resolve();
        },
        reject,
      )(reply);
    });
  });
}
export function createInviteLink() {
  return new Promise<{ token: string }>((resolve, reject) => {
    if (!socket?.connected) return reject(Error("OFFLINE"));
    socket.timeout(8000).emit("lobby:create-invite", (err, reply) =>
      err ? reject(Error("TIMEOUT")) : callback(resolve, reject)(reply),
    );
  });
}
export function action(payload: Action) {
  return new Promise<void>((resolve, reject) => {
    if (!socket?.connected) return reject(Error("OFFLINE"));
    socket
      .timeout(8000)
      .emit("game:action", payload, (err, reply) =>
        err ? reject(Error("TIMEOUT")) : callback(resolve, reject)(reply),
      );
  });
}
export function language(lang: "de" | "en") {
  localStorage.setItem("language", lang);
  document.documentElement.lang = lang;
  useGame.setState({ language: lang });
}

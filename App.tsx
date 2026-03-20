import { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  where,
  getDocs,
} from "firebase/firestore";

const YT_API_KEY = "AIzaSyAg3xY_I7bJ77RRIFLnF0F6eSUqudrXlVI";

interface Short {
  id: string;
  title: string;
  creator: string;
  thumbnail: string;
  videoId: string;
}

interface AppUser {
  uid: string;
  name: string;
  email: string;
  photo?: string;
}

interface Message {
  id: string;
  from: string;
  fromName?: string;
  text: string;
  short?: Short | null;
  timestamp?: any;
}

interface Group {
  id: string;
  name: string;
  emoji: string;
  members: string[];
}

const dmChatId = (uid1: string, uid2: string) => [uid1, uid2].sort().join("_");
const groupChatId = (gid: string) => `group_${gid}`;

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function colorFromUid(uid: string) {
  const colors = [
    "#7c3fbf",
    "#1a7bc4",
    "#1a9e5c",
    "#d4760a",
    "#c0392b",
    "#0f6e56",
    "#534AB7",
    "#993556",
  ];
  let hash = 0;
  for (let i = 0; i < uid.length; i++)
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

async function fetchShorts(
  q = "#shorts",
  pageToken = ""
): Promise<{ shorts: Short[]; nextPageToken: string }> {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(
    q
  )}&type=video&videoDuration=short&key=${YT_API_KEY}${
    pageToken ? "&pageToken=" + pageToken : ""
  }`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.items) return { shorts: [], nextPageToken: "" };
  return {
    shorts: data.items.map((item: any) => ({
      id: item.id.videoId,
      videoId: item.id.videoId,
      title: item.snippet.title,
      creator: item.snippet.channelTitle,
      thumbnail:
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        "",
    })),
    nextPageToken: data.nextPageToken || "",
  };
}

function Avatar({
  name = "",
  photo,
  uid,
  size = 36,
}: {
  name?: string;
  photo?: string;
  uid?: string;
  size?: number;
}) {
  if (photo)
    return (
      <img
        src={photo}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: uid ? colorFromUid(uid) : "#555",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.35,
        fontWeight: 600,
        color: "#fff",
        flexShrink: 0,
      }}
    >
      {initials(name) || "?"}
    </div>
  );
}

function ShortCard({
  short,
  compact = false,
  onShare,
}: {
  short: Short;
  compact?: boolean;
  onShare?: (s: Short) => void;
}) {
  return (
    <div
      style={{
        background: "#1c1c1e",
        borderRadius: 12,
        overflow: "hidden",
        width: compact ? 170 : "100%",
        flexShrink: 0,
      }}
    >
      <div style={{ position: "relative", height: compact ? 100 : 160 }}>
        <img
          src={short.thumbnail}
          alt={short.title}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                borderTop: "7px solid transparent",
                borderBottom: "7px solid transparent",
                borderLeft: "12px solid #fff",
                marginLeft: 3,
              }}
            />
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            background: "#ff0000",
            borderRadius: 4,
            padding: "2px 6px",
            fontSize: 9,
            color: "#fff",
            fontWeight: 700,
          }}
        >
          SHORTS
        </div>
        {onShare && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShare(short);
            }}
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              background: "rgba(0,0,0,0.55)",
              border: "none",
              borderRadius: "50%",
              width: 30,
              height: 30,
              cursor: "pointer",
              color: "#fff",
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ↗
          </button>
        )}
      </div>
      <div style={{ padding: "8px 10px" }}>
        <div
          style={{
            color: "#fff",
            fontSize: compact ? 11 : 13,
            fontWeight: 500,
            lineHeight: 1.3,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {short.title}
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: compact ? 10 : 11,
            marginTop: 3,
          }}
        >
          {short.creator}
        </div>
      </div>
    </div>
  );
}

function ShareSheet({
  short,
  friends,
  groups,
  onClose,
  onSend,
}: {
  short: Short;
  friends: AppUser[];
  groups: Group[];
  onClose: () => void;
  onSend: (type: string, id: string, short: Short) => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1c1c1e",
          borderRadius: "20px 20px 0 0",
          padding: "14px 0 28px",
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            background: "#444",
            borderRadius: 2,
            margin: "0 auto 14px",
          }}
        />
        <div
          style={{
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          Send to Shorts Chat
        </div>
        {friends.length === 0 && groups.length === 0 ? (
          <div
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: 13,
              textAlign: "center",
              padding: "12px 24px",
            }}
          >
            No friends yet — add some from the Chat tab!
          </div>
        ) : (
          <>
            {friends.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  padding: "0 16px",
                  overflowX: "auto",
                  marginBottom: 16,
                }}
              >
                {friends.map((f) => (
                  <div
                    key={f.uid}
                    onClick={() => onSend("dm", f.uid, short)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <Avatar
                      name={f.name}
                      photo={f.photo}
                      uid={f.uid}
                      size={48}
                    />
                    <div
                      style={{ color: "rgba(255,255,255,0.75)", fontSize: 11 }}
                    >
                      {f.name.split(" ")[0]}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {groups.length > 0 && (
              <>
                <div
                  style={{ borderTop: "0.5px solid #333", margin: "0 0 10px" }}
                />
                <div
                  style={{
                    color: "#888",
                    fontSize: 11,
                    padding: "0 16px 6px",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                  }}
                >
                  GROUPS
                </div>
                {groups.map((g) => (
                  <div
                    key={g.id}
                    onClick={() => onSend("group", g.id, short)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 16px",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: "#2c2c2e",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                      }}
                    >
                      {g.emoji}
                    </div>
                    <div style={{ color: "#fff", fontSize: 13 }}>{g.name}</div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ShortsView({ onShare }: { onShare: (s: Short) => void }) {
  const [shorts, setShorts] = useState<Short[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [nextPageToken, setNextPageToken] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    setLoading(true);
    setIdx(0);
    fetchShorts(searchTerm || "#shorts").then(({ shorts, nextPageToken }) => {
      setShorts(shorts);
      setNextPageToken(nextPageToken);
      setLoading(false);
    });
  }, [searchTerm]);

  const handleNext = async () => {
    if (idx < shorts.length - 1) {
      setIdx(idx + 1);
      return;
    }
    if (!nextPageToken) return;
    const { shorts: more, nextPageToken: next } = await fetchShorts(
      searchTerm || "#shorts",
      nextPageToken
    );
    setShorts((prev) => [...prev, ...more]);
    setNextPageToken(next);
    setIdx((i) => i + 1);
  };

  const short = shorts[idx];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#0f0f0f",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          background: "#1c1c1e",
          padding: "10px 12px",
          display: "flex",
          gap: 8,
          borderBottom: "0.5px solid #2c2c2e",
        }}
      >
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setSearchTerm(searchInput)}
          placeholder="Search Shorts..."
          style={{
            flex: 1,
            background: "#2c2c2e",
            border: "none",
            borderRadius: 20,
            padding: "8px 14px",
            color: "#fff",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          onClick={() => setSearchTerm(searchInput)}
          style={{
            background: "#ff0000",
            border: "none",
            borderRadius: 20,
            padding: "8px 16px",
            color: "#fff",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Go
        </button>
      </div>
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          background: "#000",
        }}
      >
        {loading ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ color: "#ff0000", fontSize: 36 }}>▶</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
              Loading Shorts...
            </div>
          </div>
        ) : short ? (
          <>
            <iframe
              key={short.videoId}
              src={`https://www.youtube.com/embed/${short.videoId}?autoplay=1&rel=0&modestbranding=1`}
              style={{ width: "100%", height: "100%", border: "none" }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={short.title}
            />
            <div
              style={{
                position: "absolute",
                right: 10,
                bottom: 70,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 18,
                zIndex: 10,
              }}
            >
              <div
                onClick={() => idx > 0 && setIdx(idx - 1)}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                ↑
              </div>
              <div
                onClick={handleNext}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                ↓
              </div>
              <div
                onClick={() => onShare(short)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    background: "#ff0000",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    color: "#fff",
                    fontWeight: 700,
                  }}
                >
                  ↗
                </div>
                <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 10 }}>
                  Share
                </div>
              </div>
            </div>
            <div
              style={{
                position: "absolute",
                left: 12,
                bottom: 10,
                right: 58,
                zIndex: 10,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  textShadow: "0 1px 4px rgba(0,0,0,0.9)",
                  lineHeight: 1.4,
                }}
              >
                {short.title}
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 10,
                  marginTop: 2,
                }}
              >
                {short.creator}
              </div>
            </div>
          </>
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
              No Shorts found
            </div>
          </div>
        )}
      </div>
      <div
        style={{
          height: 52,
          background: "rgba(15,15,15,0.98)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          borderTop: "0.5px solid #222",
        }}
      >
        {[
          ["🏠", "Home"],
          ["🔍", "Search"],
          ["▶", "Shorts", "#ff0000"],
          ["📚", "Library"],
          ["👤", "You"],
        ].map(([icon, label, color]) => (
          <div
            key={label}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                fontSize: label === "Shorts" ? 20 : 15,
                color: (color as string) || "rgba(255,255,255,0.45)",
              }}
            >
              {icon}
            </div>
            <div
              style={{
                fontSize: 9,
                color: label === "Shorts" ? "#fff" : "rgba(255,255,255,0.45)",
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddFriendScreen({
  currentUser,
  onBack,
  onAdded,
}: {
  currentUser: AppUser;
  onBack: () => void;
  onAdded: () => void;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "found" | "notfound" | "added" | "self"
  >("idle");
  const [foundUser, setFoundUser] = useState<AppUser | null>(null);

  const handleSearch = async () => {
    if (!email.trim()) return;
    setStatus("loading");
    setFoundUser(null);
    if (email.trim().toLowerCase() === currentUser.email.toLowerCase()) {
      setStatus("self");
      return;
    }
    const snap = await getDocs(
      query(
        collection(db, "users"),
        where("email", "==", email.trim().toLowerCase())
      )
    );
    if (snap.empty) {
      setStatus("notfound");
      return;
    }
    setFoundUser(snap.docs[0].data() as AppUser);
    setStatus("found");
  };

  const handleAdd = async () => {
    if (!foundUser) return;
    await setDoc(doc(db, "friends", `${currentUser.uid}_${foundUser.uid}`), {
      users: [currentUser.uid, foundUser.uid],
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, "friends", `${foundUser.uid}_${currentUser.uid}`), {
      users: [foundUser.uid, currentUser.uid],
      createdAt: serverTimestamp(),
    });
    setStatus("added");
    setTimeout(() => {
      onAdded();
      onBack();
    }, 1200);
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#0f0f0f",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          background: "#1c1c1e",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "0.5px solid #2c2c2e",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "#ff0000",
            fontSize: 24,
            cursor: "pointer",
            padding: 0,
          }}
        >
          ‹
        </button>
        <div style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>
          Add a friend
        </div>
      </div>
      <div
        style={{
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          Enter your friend's email address to find them on Shorts Chat.
        </div>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="friend@email.com"
          style={{
            background: "#2c2c2e",
            border: "0.5px solid #3c3c3e",
            borderRadius: 12,
            padding: "12px 14px",
            color: "#fff",
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          onClick={handleSearch}
          disabled={status === "loading"}
          style={{
            background: "#ff0000",
            border: "none",
            borderRadius: 12,
            padding: "12px",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            opacity: status === "loading" ? 0.7 : 1,
          }}
        >
          {status === "loading" ? "Searching..." : "Search"}
        </button>
        {status === "self" && (
          <div
            style={{
              background: "#2c2c2e",
              borderRadius: 12,
              padding: "14px",
              color: "rgba(255,255,255,0.5)",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            That's your own email!
          </div>
        )}
        {status === "notfound" && (
          <div
            style={{
              background: "#2c2c2e",
              borderRadius: 12,
              padding: "14px",
              color: "rgba(255,255,255,0.5)",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            No user found. They need to sign up first!
          </div>
        )}
        {status === "found" && foundUser && (
          <div
            style={{
              background: "#1c1c1e",
              border: "0.5px solid #3c3c3e",
              borderRadius: 14,
              padding: "16px",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <Avatar
              name={foundUser.name}
              photo={foundUser.photo}
              uid={foundUser.uid}
              size={50}
            />
            <div style={{ flex: 1 }}>
              <div style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>
                {foundUser.name}
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                {foundUser.email}
              </div>
            </div>
            <button
              onClick={handleAdd}
              style={{
                background: "#ff0000",
                border: "none",
                borderRadius: 10,
                padding: "8px 16px",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Add
            </button>
          </div>
        )}
        {status === "added" && (
          <div
            style={{
              background: "#0F6E56",
              borderRadius: 12,
              padding: "14px",
              color: "#fff",
              fontSize: 13,
              textAlign: "center",
              fontWeight: 500,
            }}
          >
            ✓ Friend added! You can now chat.
          </div>
        )}
      </div>
    </div>
  );
}

function ChatView({
  title,
  subtitle,
  avatarEl,
  messages,
  currentUid,
  onBack,
  onSend,
}: any) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#0f0f0f",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          background: "#1c1c1e",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "0.5px solid #2c2c2e",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "#ff0000",
            fontSize: 24,
            cursor: "pointer",
            padding: 0,
          }}
        >
          ‹
        </button>
        {avatarEl}
        <div style={{ flex: 1 }}>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>
            {title}
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
            {subtitle}
          </div>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              color: "rgba(255,255,255,0.3)",
              fontSize: 13,
              textAlign: "center",
              marginTop: 40,
            }}
          >
            No messages yet. Share a Short! 🎬
          </div>
        )}
        {messages.map((msg: Message) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              justifyContent:
                msg.from === currentUid ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: msg.from === currentUid ? "flex-end" : "flex-start",
                gap: 4,
                maxWidth: "82%",
              }}
            >
              {msg.short && <ShortCard short={msg.short} compact />}
              {msg.text ? (
                <div
                  style={{
                    background: msg.from === currentUid ? "#ff0000" : "#2c2c2e",
                    borderRadius:
                      msg.from === currentUid
                        ? "16px 16px 4px 16px"
                        : "16px 16px 16px 4px",
                    padding: "9px 13px",
                  }}
                >
                  <div style={{ color: "#fff", fontSize: 13, lineHeight: 1.5 }}>
                    {msg.text}
                  </div>
                </div>
              ) : null}
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                {msg.timestamp?.toDate
                  ? msg.timestamp
                      .toDate()
                      .toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                  : ""}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div
        style={{
          padding: "8px 12px",
          background: "#1c1c1e",
          borderTop: "0.5px solid #2c2c2e",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) {
              onSend(text.trim());
              setText("");
            }
          }}
          placeholder="Message..."
          style={{
            flex: 1,
            background: "#2c2c2e",
            border: "none",
            borderRadius: 20,
            padding: "9px 14px",
            color: "#fff",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          onClick={() => {
            if (text.trim()) {
              onSend(text.trim());
              setText("");
            }
          }}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "#ff0000",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderTop: "6px solid transparent",
              borderBottom: "6px solid transparent",
              borderLeft: "11px solid #fff",
              marginLeft: 2,
            }}
          />
        </button>
      </div>
    </div>
  );
}

function InboxView({
  currentUser,
  friends,
  groups,
  onOpenDM,
  onOpenGroup,
  onAddFriend,
  onSignOut,
}: any) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#0f0f0f",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          background: "#1c1c1e",
          padding: "14px 16px 12px",
          borderBottom: "0.5px solid #2c2c2e",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ color: "#fff", fontSize: 20, fontWeight: 700 }}>
            Shorts Chat
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: 12,
              marginTop: 2,
            }}
          >
            Hi, {currentUser.displayName?.split(" ")[0]} 👋
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar
            name={currentUser.displayName}
            photo={currentUser.photoURL}
            uid={currentUser.uid}
            size={30}
          />
          <button
            onClick={onSignOut}
            style={{
              background: "none",
              border: "0.5px solid #444",
              borderRadius: 8,
              color: "rgba(255,255,255,0.5)",
              fontSize: 11,
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            Out
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          onClick={onAddFriend}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            cursor: "pointer",
            borderBottom: "0.5px solid #1a1a1a",
            background: "#1c1c1e",
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              background: "#2c2c2e",
              border: "1.5px dashed #ff0000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              color: "#ff0000",
            }}
          >
            +
          </div>
          <div>
            <div style={{ color: "#ff0000", fontSize: 14, fontWeight: 500 }}>
              Add a friend
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.35)",
                fontSize: 12,
                marginTop: 1,
              }}
            >
              Search by email address
            </div>
          </div>
        </div>
        {groups.length > 0 && (
          <>
            <div
              style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: 11,
                fontWeight: 700,
                padding: "12px 16px 6px",
                letterSpacing: "0.07em",
              }}
            >
              GROUPS
            </div>
            {groups.map((g: Group) => (
              <div
                key={g.id}
                onClick={() => onOpenGroup(g.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 16px",
                  cursor: "pointer",
                  borderBottom: "0.5px solid #1a1a1a",
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    background: "#2c2c2e",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                  }}
                >
                  {g.emoji}
                </div>
                <div>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>
                    {g.name}
                  </div>
                  <div
                    style={{
                      color: "rgba(255,255,255,0.35)",
                      fontSize: 12,
                      marginTop: 1,
                    }}
                  >
                    Group chat
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
        {friends.length > 0 && (
          <>
            <div
              style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: 11,
                fontWeight: 700,
                padding: "12px 16px 6px",
                letterSpacing: "0.07em",
              }}
            >
              FRIENDS
            </div>
            {friends.map((f: AppUser) => (
              <div
                key={f.uid}
                onClick={() => onOpenDM(f.uid)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 16px",
                  cursor: "pointer",
                  borderBottom: "0.5px solid #1a1a1a",
                }}
              >
                <Avatar name={f.name} photo={f.photo} uid={f.uid} size={46} />
                <div>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>
                    {f.name}
                  </div>
                  <div
                    style={{
                      color: "rgba(255,255,255,0.35)",
                      fontSize: 12,
                      marginTop: 1,
                    }}
                  >
                    {f.email}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
        {friends.length === 0 && groups.length === 0 && (
          <div style={{ padding: "40px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <div
              style={{
                color: "#fff",
                fontSize: 14,
                fontWeight: 500,
                marginBottom: 8,
              }}
            >
              No friends yet
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              Tap "Add a friend" above to find people by their email address.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch {
      setError("Sign-in failed. Please try again.");
      setLoading(false);
    }
  };
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#0f0f0f",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
      }}
    >
      <div style={{ fontSize: 52, marginBottom: 16, color: "#ff0000" }}>▶</div>
      <div
        style={{
          color: "#fff",
          fontSize: 24,
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Shorts Chat
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.45)",
          fontSize: 13,
          textAlign: "center",
          marginBottom: 48,
          lineHeight: 1.7,
        }}
      >
        Share YouTube Shorts with friends — no link copying needed
      </div>
      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          background: "#fff",
          border: "none",
          borderRadius: 28,
          padding: "14px 24px",
          cursor: loading ? "not-allowed" : "pointer",
          fontSize: 15,
          fontWeight: 600,
          color: "#222",
          width: "100%",
          opacity: loading ? 0.7 : 1,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        {loading ? "Signing in..." : "Continue with Google"}
      </button>
      {error && (
        <div style={{ color: "#ff6b6b", fontSize: 13, marginTop: 16 }}>
          {error}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState("shorts");
  const [friends, setFriends] = useState<AppUser[]>([]);
  const [groups] = useState<Group[]>([]);
  const [shareShort, setShareShort] = useState<Short | null>(null);
  const [openDM, setOpenDM] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [addingFriend, setAddingFriend] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        await setDoc(
          doc(db, "users", user.uid),
          {
            name: user.displayName,
            email: user.email?.toLowerCase(),
            photo: user.photoURL,
            uid: user.uid,
            lastSeen: serverTimestamp(),
          },
          { merge: true }
        );
      }
      setCurrentUser(user);
      setAuthLoading(false);
    });
  }, []);

  const loadFriends = async () => {
    if (!currentUser) return;
    const snap = await getDocs(
      query(
        collection(db, "friends"),
        where("users", "array-contains", currentUser.uid)
      )
    );
    const friendUids = snap.docs
      .map((d) => {
        const users: string[] = d.data().users;
        return users.find((u) => u !== currentUser.uid)!;
      })
      .filter(Boolean);
    const profiles: AppUser[] = [];
    for (const uid of friendUids) {
      const uDoc = await getDoc(doc(db, "users", uid));
      if (uDoc.exists()) profiles.push(uDoc.data() as AppUser);
    }
    setFriends(profiles);
  };

  useEffect(() => {
    if (currentUser) loadFriends();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || (!openDM && !openGroup)) {
      setMessages([]);
      return;
    }
    const chatId = openDM
      ? dmChatId(currentUser.uid, openDM)
      : groupChatId(openGroup!);
    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("timestamp", "asc")
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message)));
    });
  }, [openDM, openGroup, currentUser]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const sendMessage = async (text: string, short: Short | null = null) => {
    if (!currentUser) return;
    const chatId = openDM
      ? dmChatId(currentUser.uid, openDM!)
      : groupChatId(openGroup!);
    await addDoc(collection(db, "chats", chatId, "messages"), {
      text: text || "",
      from: currentUser.uid,
      fromName: currentUser.displayName,
      fromPhoto: currentUser.photoURL,
      short: short || null,
      timestamp: serverTimestamp(),
    });
  };

  const handleShare = (type: string, id: string, short: Short) => {
    setShareShort(null);
    if (type === "dm") {
      setOpenDM(id);
      setOpenGroup(null);
    } else {
      setOpenGroup(id);
      setOpenDM(null);
    }
    setTab("chat");
    setTimeout(async () => {
      if (!currentUser) return;
      const chatId =
        type === "dm" ? dmChatId(currentUser.uid, id) : groupChatId(id);
      await addDoc(collection(db, "chats", chatId, "messages"), {
        text: "",
        from: currentUser.uid,
        fromName: currentUser.displayName,
        fromPhoto: currentUser.photoURL,
        short,
        timestamp: serverTimestamp(),
      });
      const name =
        type === "dm"
          ? friends.find((f) => f.uid === id)?.name.split(" ")[0] || "friend"
          : groups.find((g) => g.id === id)?.name || "group";
      showToast(`Sent to ${name}!`);
    }, 200);
  };

  if (authLoading) {
    return (
      <div
        style={{ display: "flex", justifyContent: "center", padding: "2rem 0" }}
      >
        <div
          style={{
            width: 320,
            height: 636,
            background: "#0f0f0f",
            borderRadius: 36,
            border: "3px solid #333",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            Loading…
          </div>
        </div>
      </div>
    );
  }

  const openChatFriend = friends.find((f) => f.uid === openDM);
  const openChatGroup = groups.find((g) => g.id === openGroup);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "2rem 0",
        minHeight: 600,
      }}
    >
      <div
        style={{
          width: 320,
          background: "#0f0f0f",
          borderRadius: 36,
          overflow: "hidden",
          border: "3px solid #333",
          boxShadow: "0 0 0 1px #555",
          position: "relative",
        }}
      >
        <div
          style={{
            height: 28,
            background: "#0f0f0f",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              background: "#222",
              borderRadius: "50%",
            }}
          />
        </div>
        <div style={{ height: 580, position: "relative", overflow: "hidden" }}>
          {!currentUser && <LoginScreen />}
          {currentUser && tab === "shorts" && (
            <ShortsView onShare={(s) => setShareShort(s)} />
          )}
          {currentUser &&
            tab === "chat" &&
            !openDM &&
            !openGroup &&
            !addingFriend && (
              <InboxView
                currentUser={currentUser}
                friends={friends}
                groups={groups}
                onOpenDM={(id: string) => {
                  setOpenDM(id);
                  setOpenGroup(null);
                }}
                onOpenGroup={(id: string) => {
                  setOpenGroup(id);
                  setOpenDM(null);
                }}
                onAddFriend={() => setAddingFriend(true)}
                onSignOut={() => signOut(auth)}
              />
            )}
          {currentUser && tab === "chat" && addingFriend && (
            <AddFriendScreen
              currentUser={{
                uid: currentUser.uid,
                name: currentUser.displayName,
                email: currentUser.email,
                photo: currentUser.photoURL,
              }}
              onBack={() => setAddingFriend(false)}
              onAdded={loadFriends}
            />
          )}
          {currentUser && tab === "chat" && openDM && openChatFriend && (
            <ChatView
              title={openChatFriend.name}
              subtitle={openChatFriend.email}
              avatarEl={
                <Avatar
                  name={openChatFriend.name}
                  photo={openChatFriend.photo}
                  uid={openChatFriend.uid}
                  size={34}
                />
              }
              messages={messages}
              currentUid={currentUser.uid}
              onBack={() => setOpenDM(null)}
              onSend={(text: string) => sendMessage(text)}
            />
          )}
          {currentUser && tab === "chat" && openGroup && openChatGroup && (
            <ChatView
              title={openChatGroup.name}
              subtitle={`${openChatGroup.emoji} Group`}
              avatarEl={
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: "#2c2c2e",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                  }}
                >
                  {openChatGroup.emoji}
                </div>
              }
              messages={messages}
              currentUid={currentUser.uid}
              onBack={() => setOpenGroup(null)}
              onSend={(text: string) => sendMessage(text)}
            />
          )}
          {currentUser && shareShort && (
            <ShareSheet
              short={shareShort}
              friends={friends}
              groups={groups}
              onClose={() => setShareShort(null)}
              onSend={handleShare}
            />
          )}
          {toast && (
            <div
              style={{
                position: "absolute",
                bottom: 70,
                left: "50%",
                transform: "translateX(-50%)",
                background: "#333",
                color: "#fff",
                fontSize: 12,
                padding: "7px 18px",
                borderRadius: 20,
                whiteSpace: "nowrap",
                zIndex: 100,
              }}
            >
              {toast}
            </div>
          )}
        </div>
        {currentUser && (
          <div
            style={{
              height: 52,
              background: "#0f0f0f",
              borderTop: "0.5px solid #1c1c1e",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-around",
            }}
          >
            {[
              ["▶", "Shorts", "shorts"],
              ["💬", "Chat", "chat"],
            ].map(([icon, label, t]) => (
              <div
                key={t}
                onClick={() => {
                  setTab(t);
                  if (t === "shorts") {
                    setOpenDM(null);
                    setOpenGroup(null);
                    setAddingFriend(false);
                  }
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  cursor: "pointer",
                  padding: "0 28px",
                }}
              >
                <div
                  style={{
                    fontSize: t === "shorts" ? 22 : 20,
                    color:
                      tab === t
                        ? t === "shorts"
                          ? "#ff0000"
                          : "#fff"
                        : "rgba(255,255,255,0.38)",
                  }}
                >
                  {icon}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: tab === t ? "#fff" : "rgba(255,255,255,0.38)",
                    fontWeight: tab === t ? 600 : 400,
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

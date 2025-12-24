import { db } from "./config.js";
import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    getDoc,
    setDoc,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * WORKS
 */

export function subscribeWorks(uid, callback) {
    const q = query(collection(db, "works"), where("uid", "==", uid));
    return onSnapshot(q, (snapshot) => {
        const works = [];
        snapshot.forEach((doc) => {
            works.push({ id: doc.id, ...doc.data() });
        });
        callback(works);
    });
}

export async function createWork(data) {
    const docRef = await addDoc(collection(db, "works"), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        pinned: false,
        totalChars: 0
    });
    return docRef.id;
}

export async function updateWork(workId, data) {
    const docRef = doc(db, "works", workId);
    await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
}

export async function deleteWork(workId) {
    await deleteDoc(doc(db, "works", workId));
}

export async function toggleWorkPin(workId, currentPinStatus) {
    const docRef = doc(db, "works", workId);
    await updateDoc(docRef, { pinned: !currentPinStatus });
}

/**
 * CHAPTERS
 */

export function subscribeChapters(workId, callback) {
    const q = query(collection(db, "works", workId, "chapters"), orderBy("order", "asc"));
    return onSnapshot(q, (snapshot) => {
        const chapters = [];
        snapshot.forEach((doc) => {
            chapters.push({ id: doc.id, ...doc.data() });
        });
        callback(chapters);
    });
}

export async function createChapter(workId, order) {
    const docRef = await addDoc(collection(db, "works", workId, "chapters"), {
        title: `第${order}話`,
        content: "",
        order: order,
        updatedAt: serverTimestamp()
    });
    return docRef.id;
}

export async function updateChapter(workId, chapterId, content) {
    const docRef = doc(db, "works", workId, "chapters", chapterId);
    await updateDoc(docRef, {
        content: content,
        updatedAt: serverTimestamp()
    });
}

/**
 * STATISTICS & HISTORY
 */

export async function updateDailyProgress(uid, count) {
    const today = new Date().toISOString().split('T')[0];
    const docRef = doc(db, "users", uid, "dailyProgress", today);
    await setDoc(docRef, {
        count: count,
        date: today
    }, { merge: true });
}

export async function getRecentDailyProgress(uid, days = 7) {
    const q = query(
        collection(db, "users", uid, "dailyProgress"),
        orderBy("date", "desc")
    );
    const snapshot = await getDocs(q);
    const stats = [];
    snapshot.forEach((doc) => stats.push(doc.data()));
    return stats.slice(0, days).reverse();
}

/**
 * HISTORY BACKUP (Diff)
 */
await addDoc(historyRef, {
    content: content,
    timestamp: serverTimestamp()
});
}

/**
 * MEMOS
 */

export function subscribeMemos(workId, callback) {
    const q = query(collection(db, "works", workId, "memos"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
        const memos = [];
        snapshot.forEach((doc) => {
            memos.push({ id: doc.id, ...doc.data() });
        });
        callback(memos);
    });
}

export async function createMemo(workId, title, content) {
    const docRef = await addDoc(collection(db, "works", workId, "memos"), {
        title: title || "新規メモ",
        content: content || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    return docRef.id;
}

export async function updateMemo(workId, memoId, data) {
    const docRef = doc(db, "works", workId, "memos", memoId);
    await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
}

export async function deleteMemo(workId, memoId) {
    await deleteDoc(doc(db, "works", workId, "memos", memoId));
}

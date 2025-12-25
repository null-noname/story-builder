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
 * WORKS (作品管理)
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
 * CHAPTERS (話管理)
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
 * CHARACTERS (キャラクター管理)
 */

export function subscribeCharacters(workId, callback) {
    const q = query(collection(db, "works", workId, "characters"), orderBy("name", "asc"));
    return onSnapshot(q, (snapshot) => {
        const characters = [];
        snapshot.forEach((doc) => {
            characters.push({ id: doc.id, ...doc.data() });
        });
        callback(characters);
    });
}

export async function createCharacter(workId, data) {
    const docRef = await addDoc(collection(db, "works", workId, "characters"), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    return docRef.id;
}

export async function updateCharacter(workId, characterId, data) {
    const docRef = doc(db, "works", workId, "characters", characterId);
    await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
}

export async function deleteCharacter(workId, characterId) {
    const docRef = doc(db, "works", workId, "characters", characterId);
    await deleteDoc(docRef);
}

/**
 * STATISTICS & HISTORY (統計・履歴)
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
 * HISTORY BACKUP (バックアップ)
 */
export async function saveHistoryBackup(workId, chapterId, content) {
    const historyRef = collection(db, "works", workId, "chapters", chapterId, "history");
    const data = {
        content: content,
        timestamp: serverTimestamp()
    };
    await addDoc(historyRef, data);
}

/**
 * MEMOS (メモ管理)
 */

export function subscribeMemos(workId, callback) {
    const q = query(collection(db, "works", workId, "memos"), orderBy("order", "asc"));
    return onSnapshot(q, (snapshot) => {
        const memos = [];
        snapshot.forEach((doc) => {
            memos.push({ id: doc.id, ...doc.data() });
        });
        callback(memos);
    });
}

export async function createMemo(workId, title, content) {
    const initialOrder = Date.now();
    const docRef = await addDoc(collection(db, "works", workId, "memos"), {
        title: title || "新規メモ",
        content: content || "",
        order: initialOrder,
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

export async function updateMemoOrder(workId, id1, order1, id2, order2) {
    const ref1 = doc(db, "works", workId, "memos", id1);
    const ref2 = doc(db, "works", workId, "memos", id2);
    await updateDoc(ref1, { order: order2, updatedAt: serverTimestamp() });
    await updateDoc(ref2, { order: order1, updatedAt: serverTimestamp() });
}

export async function deleteMemo(workId, memoId) {
    await deleteDoc(doc(db, "works", workId, "memos", memoId));
}

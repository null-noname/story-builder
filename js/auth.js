import { auth, googleProvider } from "./config.js";
import { signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/**
 * Handles Google Login
 */
export async function login() {
    try {
        await signInWithPopup(auth, googleProvider);
    } catch (error) {
        console.error("Login Error:", error);
        throw error;
    }
}

/**
 * Handles Logout
 */
export async function logout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout Error:", error);
        throw error;
    }
}

/**
 * Observes Auth State Changes
 * @param {Function} callback - Function to call on auth state change
 */
export function observeAuth(callback) {
    onAuthStateChanged(auth, callback);
}

/**
 * Gets currently logged in user
 */
export function getCurrentUser() {
    return auth.currentUser;
}

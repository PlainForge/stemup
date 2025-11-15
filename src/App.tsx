import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'

import type {  UserData } from './myDataTypes';
import useUser from './hooks/UserHook';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

import './App.css'
import Nav from './components/Nav';
import Loading from './pages/Loading';

function App() {
  const [user, userData, loading] = useUser();
  const [currentRoleId, setCurrentRoleId] = useState<string | null>(null);
  const navigate = useNavigate?.();

  useEffect(() => {
    if (!user || !userData) return;

    const unsub = onSnapshot(collection(db, "users"), (snap) => {
        const cache: Record<string, UserData> = {};
        snap.forEach((doc) => {
            cache[doc.id] = doc.data() as UserData;
        });
    });

    return () => unsub();
  }, [user, userData]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) return;

      const userRef = doc(db, "users", firebaseUser.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const roleId = userSnap.data().currentRole || null;
        setCurrentRoleId(roleId);

        if (roleId) {
          const roleSnap = await getDoc(doc(db, "roles", roleId));
          if (roleSnap.exists()) {
            // Redirect to the current role page
            if (navigate) navigate(`/roles/${roleId}`, { replace: true });
          }
        } else {
          if (navigate) navigate("/"); // fallback to home if no role
        }
      }
    });

    return () => unsub();
  }, [navigate]);

  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    const unsub = onSnapshot(userRef, async (snap) => {
      if (!snap.exists()) return;
      const newRoleId = snap.data().currentRole || null;

      if (newRoleId && newRoleId !== currentRoleId) {
        setCurrentRoleId(newRoleId);

        const roleSnap = await getDoc(doc(db, "roles", newRoleId));
        if (roleSnap.exists()) {
          if (navigate) navigate(`/roles/${newRoleId}`, { replace: true });
        }
      }
    });

    return () => unsub();
  }, [user, currentRoleId, navigate]);

  useEffect(() => {
    if (user === null) {
      navigate("/login", { replace: true });
    }
  }, [user, navigate]);

  if (loading) return <Loading />

  if (!user) {
    return (
      <div className='app'>
        <Outlet />
      </div>
    )
  } else {
    return (
      <div className='app'>
        <Nav />
        <Outlet />
      </div>
    );
  }
}

export default App

import { useEffect, useState } from 'react'
import './App.css'
import LoginBox from './components/loginBox'
import LeftNav from './components/leftNav'
import Settings from './components/settings';
import Dash from './components/dash';
import Roles from './components/roles';
import RolePage from './components/rolePage';
import type { Role, UserData } from './myDataTypes';
import useUser from './hooks/user';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

function App() {
  const [user, userData, loading] = useUser();
  const [userCache, setUserCache] = useState<Record<string, UserData>>({});
  const [page, setPage] = useState("login");
  const [role, setRole] = useState<Role | null>(null);
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    if (!user || !userData) return;

    const unsub = onSnapshot(collection(db, "users"), (snap) => {
        const cache: Record<string, UserData> = {};
        snap.forEach((doc) => {
            cache[doc.id] = doc.data() as UserData;
        });
        setUserCache(cache);
    });

    return () => unsub();
  }, [user, userData]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async () => {
      if (!user || hasRedirected) return;

      try {
        const thisUser = await getDoc(doc(db, "users", user.uid));
        if (thisUser.exists()) {
          const currentRoleId = thisUser.data().currentRole;

          if (currentRoleId) {
            const roleSnap = await getDoc(doc(db, "roles", currentRoleId));
            if (roleSnap.exists()) {
              const roleData = roleSnap.data() as Omit<Role, "id">;
              setRole({ id: roleSnap.id, ...roleData });

              setPage((prev) =>
                prev === "loading" || prev === "login" ? "rolepage" : prev
              );
              setHasRedirected(true);
              return;
            }
          }
        }

        // fallback if no role set
        setPage((prev) => (prev === "loading" ? "home" : prev));
      } catch (err) {
        console.error(err);
      }
    })

    return () => unsub();
  })

  if (loading) {
    return <h1>Loading...</h1>
  }
  
  return (
    <div className={user ? 'app' : 'app-login'}>
      <LeftNav toPage={setPage} setRole={setRole} page={page} />
      
      {!user ? <LoginBox setPage={setPage} /> : 
        <div className='app-container'>
          <div className={page.match("home") ? 'content-container-open' : 'content-container'}>
            {page.match("home") ? <div></div> : null}
            {page.match("settings") ? <Settings /> : null}
            {page.match("roles") ? <Roles toPage={setPage} setRole={setRole}/> : null}
            {page.match("rolepage") ? <RolePage role={role} userCache={userCache} /> : null}
          </div>
          <Dash currentPage={page} />
        </div>
      }
    </div>
  )
}

export default App

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
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

function App() {
  const [user, userData, loading] = useUser();
  const [userCache, setUserCache] = useState<Record<string, UserData>>({});
  const [page, setPage] = useState("home");
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    if (!role?.id) return;

    const roleRef = doc(db, "roles", role.id);
    const unsub = onSnapshot(roleRef, (snap) => {
      if (snap.exists()) {
        setRole({ id: snap.id, ...(snap.data() as Omit<Role, "id">) });
      } else {
        setRole(null);
        setPage("roles");
      }
    });

    return () => unsub();
  }, [role]);

  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(collection(db, "users"), (snap) => {
        const cache: Record<string, UserData> = {};
        snap.forEach((doc) => {
            cache[doc.id] = doc.data() as UserData;
        });
        setUserCache(cache);
    });

    return () => unsub();
  }, [user]);

  if (loading) {
    return <h1>Loading...</h1>
  }
  
  return (
    <div className={user && userData ? 'app' : 'app-login'}>
      <LeftNav toPage={setPage} setRole={setRole} page={page} />
      
      {!user ? <LoginBox /> : 
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

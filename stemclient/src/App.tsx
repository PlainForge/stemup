import { useEffect, useState } from 'react'
import './App.css'
import LoginBox from './components/loginBox'
import LeftNav from './components/leftNav'
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from './firebase';
import Settings from './components/settings';
import Dash from './components/dash';
import Roles from './components/roles';
import RolePage from './components/rolePage';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState("home");
  const [role, setRole] = useState({name: "", id: ""})

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false)
    });

    return () => unsub();
  }, []);

  if (loading) {
    return <h1>Loading...</h1>
  }
  
  return (
    <div className={user ? 'app' : 'app-login'}>
      <LeftNav toPage={setPage} />
      
      {!user ? <LoginBox /> : 
        <div className='app-container'>
          <div className={page.match("home") ? 'content-container-open' : 'content-container'}>
            {page.match("home") ? <div></div> : null}
            {page.match("settings") ? <Settings /> : null}
            {page.match("roles") ? <Roles toPage={setPage} setRole={setRole}/> : null}
            {page.match("rolepage") ? <RolePage role={role} /> : null}
          </div>
          <Dash currentPage={page} />
        </div>
      }
    </div>
  )
}

export default App

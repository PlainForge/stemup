import { useState } from 'react'
import './App.css'
import LoginBox from './components/loginBox'
import LeftNav from './components/leftNav'
import Settings from './components/settings';
import Dash from './components/dash';
import Roles from './components/roles';
import RolePage from './components/rolePage';
import type { Role } from './myDataTypes';
import useUser from './hooks/user';

function App() {
  const [user, loading] = useUser();
  const [page, setPage] = useState("home");
  const [role, setRole] = useState<Role | null>(null);

  if (loading) {
    return <h1>Loading...</h1>
  }
  
  return (
    <div className={user ? 'app' : 'app-login'}>
      <LeftNav toPage={setPage} setRole={setRole} page={page} />
      
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

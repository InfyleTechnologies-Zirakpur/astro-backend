import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import UserDetail from './pages/UserDetail'
import Profiles from './pages/Profiles'
import Matches from './pages/Matches'
import MatchDetail from './pages/MatchDetail'
import Questionnaires from './pages/Questionnaires'
import Horoscopes from './pages/Horoscopes'
import DeviceTokens from './pages/DeviceTokens'

const App = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/users" element={<Users />} />
        <Route path="/users/:userId" element={<UserDetail />} />
        <Route path="/profiles" element={<Profiles />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/matches/:matchId" element={<MatchDetail />} />
        <Route path="/questionnaires" element={<Questionnaires />} />
        <Route path="/horoscopes" element={<Horoscopes />} />
        <Route path="/device-tokens" element={<DeviceTokens />} />
      </Route>
    </Routes>
  )
}

export default App
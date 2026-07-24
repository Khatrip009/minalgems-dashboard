import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ConfigProvider } from 'antd'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import ProductCreate from './pages/ProductCreate'
import Categories from './pages/Categories'
import Orders from './pages/Orders'
import OrderDetail from './pages/OrderDetail'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import Craftsmen from './pages/Craftsmen'
import CraftsmanDetail from './pages/CraftsmanDetail'
import Payments from './pages/Payments' 
import Settings from './pages/Settings'
import Users from './pages/Users'
import Profile from './pages/Profile'
import HeroSlides from './pages/HeroSlides'
import PaymentEvaluation from './pages/PaymentEvaluation'
import Returns from './pages/Returns'
import Reviews from './pages/Reviews'

// --- Luxurious Jewellery Theme Tokens ---
const themeTokens = {
  colorPrimary: '#B8860B',       // Rich gold – evokes luxury & diamond settings
  colorInfo: '#B8860B',
  colorSuccess: '#3A5A40',       // Deep green for success (like an emerald)
  colorWarning: '#C89B3C',       // Warm gold
  colorError: '#8B0000',         // Burgundy for errors
  colorTextBase: '#2C2C2C',      // Dark charcoal for readability
  colorBgBase: '#FFFFFF',
  borderRadius: 8,               // Soft, elegant corners
  fontFamily: `'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
  fontSize: 16,
  controlHeight: 40,             // Slightly taller inputs
  lineHeight: 1.6,
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: themeTokens,
        // You can override specific component styles here later if needed
      }}
    >
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="products" element={<Products />} />
              <Route path="products/new" element={<ProductCreate />} />
              <Route path="categories" element={<Categories />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              <Route path="craftsmen" element={<Craftsmen />} />
               <Route path="craftsmen/:id" element={<CraftsmanDetail />} /> 
               <Route path="payments" element={<Payments />} />
               <Route path="settings" element={<Settings />} />
               <Route path="/users" element={<Users />} />
               <Route path="/profile" element={<Profile />} />
               <Route path="/hero-slides" element={<HeroSlides />} />
               <Route path="/payment-evaluation" element={<PaymentEvaluation />} />
               <Route path="/returns" element={<Returns />} />
               <Route path="/reviews" element={<Reviews />} />

            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ConfigProvider>
  )
}
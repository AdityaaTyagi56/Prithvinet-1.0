import re

path = r'c:\Users\adity\OneDrive\Desktop\e cell\tyagi\Prithvinet-1.0-main\src\pages\dashboard\UnifiedDashboard.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add state for Copilot UI
if 'isCopilotOpen' not in content:
    content = content.replace("const [mobileMenuOpen, setMobileMenuOpen] = useState(false);", 
                              "const [mobileMenuOpen, setMobileMenuOpen] = useState(false);\n  const [isCopilotOpen, setIsCopilotOpen] = useState(false);")

# Add import for Copilot
if 'CopilotChat' not in content:
    content = content.replace("import { DashboardPage } from './DashboardPage';", 
                              "import { DashboardPage } from './DashboardPage';\nimport { CopilotChat } from '../../components/copilot/CopilotChat';\nimport { MessageSquare, X } from 'lucide-react';")

# Add Slide-over UI inside the main return
slide_over_ui = """
        {/* Floating Copilot Action Button */}
        <button
          onClick={() => setIsCopilotOpen(true)}
          className="fixed bottom-6 right-6 z-40 bg-[#166534] text-white p-4 rounded-full shadow-2xl hover:bg-[#14532d] hover:-translate-y-1 transition-all flex items-center justify-center border-2 border-[#4ade80]/30"
          aria-label="Open AI Copilot"
        >
          <MessageSquare className="w-6 h-6" />
        </button>

        {/* Copilot Slide-over Panel */}
        <div className={`fixed inset-y-0 right-0 w-full sm:w-[450px] bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.15)] z-50 transform transition-transform duration-300 ease-in-out ${isCopilotOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="h-full flex flex-col relative">
            <button 
              onClick={() => setIsCopilotOpen(false)}
              className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex-1 overflow-hidden">
              <CopilotChat />
            </div>
          </div>
        </div>

        {/* Backdrop for mobile */}
        {isCopilotOpen && (
          <div 
            className="fixed inset-0 bg-black/20 z-40 sm:hidden backdrop-blur-sm"
            onClick={() => setIsCopilotOpen(false)}
          />
        )}
"""

if 'Floating Copilot Action Button' not in content:
    content = content.replace("</main>", "</main>\n" + slide_over_ui)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Dashboard integrated with Copilot Floating UI')

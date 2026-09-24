import { FiPhone } from 'react-icons/fi';

const MessengerIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor">
    <path d="M12 0C5.373 0 0 4.975 0 11.111c0 3.497 1.745 6.616 4.472 8.653V24l4.086-2.242c1.09.301 2.246.464 3.442.464 6.627 0 12-4.974 12-11.111S18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8.2l3.131 3.26L19.752 8.2l-6.561 6.763z" />
  </svg>
);

const ZaloIcon = () => (
 <img src="https://thumb.wikimedia.org/wikipedia/commons/thumb/9/91/Icon_of_Zalo.svg/3840px-Icon_of_Zalo.svg.png?utm_source=vi.wikipedia.org&utm_campaign=index&utm_content=thumbnail" alt="" />
);

const ContactFixed = () => {
  return (
    <div className="fixed bottom-24 right-2 md:bottom-24 md:right-4 z-[9999] flex flex-col space-y-3">

      {/* Gọi ngay */}
      <a
        href="tel:0344114599"
        className="relative group flex items-center"
        title="Gọi ngay — 0344114599"
      >
        <span className="absolute right-full mr-3 flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-slate-800 to-slate-700 text-white text-xs font-bold rounded-lg shadow-xl whitespace-nowrap">
          <FiPhone className="w-3 h-3 text-green-400 flex-shrink-0" />
          Gọi ngay
          <span className="absolute top-1/2 -translate-y-1/2 right-[-5px] w-0 h-0 border-y-[5px] border-y-transparent border-l-[6px] border-l-slate-800" />
        </span>
        <span
          className="relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 hover:-translate-y-1"
          style={{
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            boxShadow: '0 4px 14px rgba(34,197,94,0.5), 0 0 0 0 rgba(34,197,94,0.4)',
            animation: 'pulse-green 2s ease-in-out infinite',
          }}
        >
          <FiPhone className="w-6 h-6 text-white" />
        </span>
      </a>

      {/* Chat Facebook */}
      <a
        href="https://www.facebook.com/phamlongfco2006"
        target="_blank"
        rel="noopener noreferrer"
        className="relative group flex items-center"
        title="Chat Facebook"
      >
        <span className="absolute right-full mr-3 flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-slate-800 to-slate-700 text-white text-xs font-bold rounded-lg shadow-xl whitespace-nowrap">
          <span className="w-4 h-4 bg-blue-500 rounded flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">f</span>
          Chat Facebook
          <span className="absolute top-1/2 -translate-y-1/2 right-[-5px] w-0 h-0 border-y-[5px] border-y-transparent border-l-[6px] border-l-slate-800" />
        </span>
        <span
          className="relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 hover:-translate-y-1"
          style={{
            background: 'linear-gradient(135deg, #1877f2, #0d47a1)',
            boxShadow: '0 4px 14px rgba(24,119,242,0.5)',
            animation: 'pulse-blue-fb 2.5s ease-in-out infinite',
          }}
        >
          <MessengerIcon />
        </span>
      </a>

      {/* Chat Zalo */}
      <a
        href="https://zalo.me/0344114599"
        target="_blank"
        rel="noopener noreferrer"
        className="relative group flex items-center"
        title="Chat Zalo"
      >
        <span className="absolute right-full mr-3 flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-slate-800 to-slate-700 text-white text-xs font-bold rounded-lg shadow-xl whitespace-nowrap">
          <span className="w-4 h-4 bg-blue-500 rounded flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">Z</span>
          Chat Zalo
          <span className="absolute top-1/2 -translate-y-1/2 right-[-5px] w-0 h-0 border-y-[5px] border-y-transparent border-l-[6px] border-l-slate-800" />
        </span>
        <span
          className="relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 hover:-translate-y-1"
          style={{
            background: 'linear-gradient(135deg, #0068ff, #0052cc)',
            boxShadow: '0 4px 14px rgba(0,104,255,0.5)',
            animation: 'pulse-blue-zalo 3s ease-in-out infinite',
          }}
        >
          <ZaloIcon />
        </span>
      </a>

      <style>{`
        @keyframes pulse-green {
          0%, 100% { box-shadow: 0 4px 14px rgba(34,197,94,0.5), 0 0 0 0 rgba(34,197,94,0.4); }
          50% { box-shadow: 0 4px 14px rgba(34,197,94,0.5), 0 0 0 10px rgba(34,197,94,0); }
        }
        @keyframes pulse-blue-fb {
          0%, 100% { box-shadow: 0 4px 14px rgba(24,119,242,0.5), 0 0 0 0 rgba(24,119,242,0.4); }
          50% { box-shadow: 0 4px 14px rgba(24,119,242,0.5), 0 0 0 10px rgba(24,119,242,0); }
        }
        @keyframes pulse-blue-zalo {
          0%, 100% { box-shadow: 0 4px 14px rgba(0,104,255,0.5), 0 0 0 0 rgba(0,104,255,0.4); }
          50% { box-shadow: 0 4px 14px rgba(0,104,255,0.5), 0 0 0 10px rgba(0,104,255,0); }
        }
      `}</style>
    </div>
  );
};

export default ContactFixed;

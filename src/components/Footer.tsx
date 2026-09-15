import React from 'react';
import Image from 'next/image';

const Footer: React.FC = () => {
  return (
    <footer className="bg-midnight border-t border-midnight-border py-8 px-6">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Image
            src="/assets/images/oie_gAxqzQFu0Ixw-1777831503416.png"
            alt="Honeymoon logo"
            width={100}
            height={30}
            className="object-contain"
            style={{ maxHeight: '30px', width: 'auto' }}
          />
          <span className="text-midnight-text text-sm ml-3">© 2026</span>
        </div>
        <div className="flex items-center gap-5 text-sm text-midnight-text">
          <a href="#" className="hover:text-white transition-colors">Privacy</a>
          <a href="#" className="hover:text-white transition-colors">Terms</a>
          <a href="mailto:hello@honeymoon.com" className="hover:text-white transition-colors">Contact</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
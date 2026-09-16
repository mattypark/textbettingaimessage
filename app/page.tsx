import Link from "next/link";
import { FolkNav } from "./(site)/folk/nav";
import { Mascot } from "./(site)/folk/mascot";
import { Phone } from "./(site)/folk/phone";
import { BetsSection, FooterCta, MoneySection, MoreSection, StatementSection } from "./(site)/folk/sections";
import { FloatingBubble, GlassBall, StickerBill, StickerBubble, StickerCamera, StickerLock, StickerLockIn, StickerSmiley, StickerTarget } from "./(site)/folk/stickers";

export default function Landing() {
  return (
    <div className="bg-[#eef1f5] text-[#1f2a2f]">
      <section className="sky-hero relative overflow-hidden px-5 pb-10 pt-[104px] sm:pt-[128px] lg:pb-16 lg:pt-[140px]">
        <FolkNav />

        {/* stickers */}
        <StickerLockIn className="float absolute left-[4%] top-[14%] hidden w-40 lg:block" style={{ "--tilt": "-8deg", "--delay": "0s" } as React.CSSProperties} />
        <StickerBubble className="float absolute right-[6%] top-[12%] hidden w-32 sm:block" style={{ "--tilt": "10deg", "--delay": "1s" } as React.CSSProperties} />
        <StickerSmiley className="float absolute -left-6 top-[46%] w-24 sm:top-[38%] sm:w-32" style={{ "--tilt": "-6deg", "--delay": "2s" } as React.CSSProperties} />
        <StickerTarget className="float absolute left-[16%] top-[52%] hidden w-28 sm:block" style={{ "--tilt": "6deg", "--delay": "0.5s" } as React.CSSProperties} />
        <StickerCamera className="float absolute right-[3%] top-[44%] w-28 sm:w-36" style={{ "--tilt": "-10deg", "--delay": "1.5s" } as React.CSSProperties} />
        <StickerBill className="float absolute right-[10%] top-[70%] hidden w-32 lg:block" style={{ "--tilt": "8deg", "--delay": "2.5s" } as React.CSSProperties} />
        <StickerLock className="float absolute right-[8%] bottom-[10%] w-24 sm:w-32" style={{ "--tilt": "-6deg", "--delay": "3s" } as React.CSSProperties} />

        {/* glass mascots */}
        <div className="float absolute left-[26%] top-[62%] hidden lg:block" style={{ "--delay": "0.8s" } as React.CSSProperties}><GlassBall size={130}><Mascot mood="sleep" size={92} /></GlassBall></div>
        <div className="float absolute right-[24%] top-[54%] hidden lg:block" style={{ "--delay": "2.2s" } as React.CSSProperties}><GlassBall size={110}><Mascot mood="ref" size={78} /></GlassBall></div>
        <div className="float absolute left-[8%] bottom-[8%] hidden md:block" style={{ "--delay": "1.4s" } as React.CSSProperties}><GlassBall size={120}><Mascot mood="money" size={84} /></GlassBall></div>

        {/* floating bubbles */}
        <FloatingBubble side="in" text="u said no doordash this week 🤨" className="float absolute left-[12%] top-[74%] hidden w-56 rotate-[-4deg] lg:block" />
        <FloatingBubble side="out" text="bro it's been a day" className="float absolute left-[24%] top-[82%] hidden rotate-[4deg] lg:block" />
        <FloatingBubble side="in" text="fine. 20 pts says you cave by friday. 👍 to lock" className="float absolute left-[13%] top-[88%] hidden w-60 rotate-[-2deg] lg:block" />

        <div className="relative mx-auto max-w-4xl text-center">
          <h1 className="font-round text-[44px] font-semibold leading-[1.02] text-white sm:text-6xl lg:text-[75px] lg:leading-[1.08]" style={{ textShadow: "0 8px 30px rgba(0,60,120,0.25)" }}>
            the <span className="text-white/70">bookie</span>
            <span className="mx-2 inline-block -translate-y-2 align-middle"><Mascot mood="wave" size={72} /></span>
            that actually settles the bet.
          </h1>
          <div className="mt-9 flex flex-col items-center gap-3">
            <Link href="/join" className="pill-3d px-8 py-3 font-round text-[15px] font-semibold">text bookie</Link>
            <Link href="/app" className="font-round text-[13px] font-medium text-white/80 hover:text-white">already a member? log in</Link>
          </div>
        </div>

        <div className="relative mx-auto mt-16 flex justify-center sm:mt-20">
          <Phone />
        </div>
      </section>

      <BetsSection />
      <StatementSection />
      <MoreSection />
      <MoneySection />
      <FooterCta />
    </div>
  );
}

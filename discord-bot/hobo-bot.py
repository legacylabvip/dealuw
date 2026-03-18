#!/usr/bin/env python3
"""
HOBO Discord Bot - Instant Property Underwriting for Wholesalers
Integrates with DealUW backend for calculations
"""

import discord
from discord.ext import commands
import aiohttp
import os
from dotenv import load_dotenv
import json

load_dotenv()

DISCORD_TOKEN = os.getenv('DISCORD_BOT_TOKEN')
BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:5000')

# Bot setup
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='/', intents=intents)

# ============ HOBO COMMANDS ============

@bot.event
async def on_ready():
    print(f'✅ HOBO Bot logged in as {bot.user}')
    try:
        await bot.tree.sync()
        print('✅ Commands synced')
    except Exception as e:
        print(f'❌ Error syncing commands: {e}')

@bot.tree.command(name="underwrite", description="Analyze a property deal")
@discord.app_commands.describe(
    arv="After-Repair Value (e.g., 300000)",
    repairs="Repair estimate (e.g., 40000)",
    deal_type="Type of deal: cash, novation, or subject-to"
)
async def underwrite(interaction: discord.Interaction, arv: int, repairs: int, deal_type: str = "cash"):
    """
    Instant property underwriting with offer analysis
    """
    await interaction.response.defer(thinking=True)
    
    try:
        # Call backend API
        async with aiohttp.ClientSession() as session:
            payload = {
                "arv": arv,
                "repairs": repairs,
                "dealType": deal_type
            }
            
            async with session.post(f'{BACKEND_URL}/api/calculate/offer-analysis', json=payload) as resp:
                if resp.status != 200:
                    await interaction.followup.send(f"❌ Error: {resp.status}")
                    return
                
                data = await resp.json()
                offers = data['offers']
        
        # Build Discord embed
        embed = discord.Embed(
            title="🏠 PROPERTY UNDERWRITING ANALYSIS",
            description=f"**ARV:** ${arv:,} | **Repairs:** ${repairs:,}",
            color=discord.Color.gold()
        )
        
        # Conservative offer
        embed.add_field(
            name="💰 CONSERVATIVE OFFER",
            value=f"**${offers['conservative']['offerPrice']:,}**\n"
                  f"Profit: ${offers['conservative']['profit']:,}\n"
                  f"Margin: {offers['conservative']['profitMargin']}%\n"
                  f"*Best for: Investor buyers*",
            inline=False
        )
        
        # Fair offer
        embed.add_field(
            name="📊 FAIR OFFER (RECOMMENDED)",
            value=f"**${offers['fair']['offerPrice']:,}**\n"
                  f"Profit: ${offers['fair']['profit']:,}\n"
                  f"Margin: {offers['fair']['profitMargin']}%\n"
                  f"*Best for: Active wholesalers*",
            inline=False
        )
        
        # Aggressive offer
        embed.add_field(
            name="⚡ AGGRESSIVE OFFER",
            value=f"**${offers['aggressive']['offerPrice']:,}**\n"
                  f"Profit: ${offers['aggressive']['profit']:,}\n"
                  f"Margin: {offers['aggressive']['profitMargin']}%\n"
                  f"*Best for: Cash buyers*",
            inline=False
        )
        
        embed.add_field(
            name="📈 Deal Type",
            value=deal_type.upper(),
            inline=True
        )
        
        embed.set_footer(text="DealForge | Forge Better Offers")
        
        await interaction.followup.send(embed=embed)
        
    except Exception as e:
        await interaction.followup.send(f"❌ Error: {str(e)}")

@bot.tree.command(name="breakdown", description="Full deal breakdown with all strategies")
@discord.app_commands.describe(
    arv="After-Repair Value",
    repairs="Repair estimate",
    fmv="Fair Market Value (for novation)"
)
async def breakdown(interaction: discord.Interaction, arv: int, repairs: int, fmv: int = None):
    """
    Full deal analysis: Cash, Novation, and Subject-To strategies
    """
    await interaction.response.defer(thinking=True)
    
    try:
        async with aiohttp.ClientSession() as session:
            # Get cash offer
            payload = {"arv": arv, "repairs": repairs}
            
            async with session.post(f'{BACKEND_URL}/api/calculate/offer-analysis', json=payload) as resp:
                data = await resp.json()
                cash_offers = data['offers']
        
        # Build comprehensive embed
        embed = discord.Embed(
            title="🔨 COMPLETE DEAL BREAKDOWN",
            description=f"**Property:** ${arv:,} ARV | **Repairs:** ${repairs:,}",
            color=discord.Color.from_rgb(74, 35, 90)  # Purple
        )
        
        # Strategy comparison
        strategies = f"""
        **💰 CASH OFFER:** ${cash_offers['fair']['offerPrice']:,}
        Profit Margin: {cash_offers['fair']['profitMargin']}%
        Your Assignment: ${cash_offers['fair']['profit']:,}
        
        **🔄 NOVATION OFFER:** ${int(arv * 0.90) - repairs:,}
        Best for: Subject-to deals where owner financing exists
        Assignment potential: Higher (deal control)
        
        **🏡 SUBJECT-TO ANALYSIS:** Pending mortgage data
        Send: /underwrite-subject-to [mortgage balance] [monthly payment] [market rent]
        """
        
        embed.add_field(name="📊 STRATEGY COMPARISON", value=strategies, inline=False)
        
        embed.add_field(
            name="🎯 RECOMMENDATION",
            value="**Fair Cash Offer** is the safest play for this property.\n"
                  "Quick closing, no complications, solid profit.",
            inline=False
        )
        
        embed.set_footer(text="DealUW (dealuw.com) | Data-driven underwriting")
        
        await interaction.followup.send(embed=embed)
        
    except Exception as e:
        await interaction.followup.send(f"❌ Error: {str(e)}")

@bot.tree.command(name="help", description="Show all HOBO commands")
async def help_command(interaction: discord.Interaction):
    """List all available HOBO commands"""
    
    embed = discord.Embed(
        title="🤖 HOBO Bot Commands",
        description="Instant property underwriting for wholesalers",
        color=discord.Color.gold()
    )
    
    embed.add_field(
        name="/underwrite",
        value="Quick offer analysis\n"
              "`/underwrite arv:300000 repairs:40000 deal_type:cash`",
        inline=False
    )
    
    embed.add_field(
        name="/breakdown",
        value="Full deal analysis with all strategies\n"
              "`/breakdown arv:300000 repairs:40000`",
        inline=False
    )
    
    embed.add_field(
        name="/help",
        value="Show this help message",
        inline=False
    )
    
    embed.set_footer(text="DealUW | dealuw.com")
    
    await interaction.response.send_message(embed=embed, ephemeral=True)

# ============ ERROR HANDLING ============

@bot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.CommandNotFound):
        await ctx.send("❌ Command not found. Use `/help`")
    else:
        await ctx.send(f"❌ Error: {str(error)}")

# ============ RUN BOT ============

if __name__ == '__main__':
    print('🚀 Starting HOBO Discord Bot...')
    bot.run(DISCORD_TOKEN)

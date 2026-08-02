import discord
from discord import app_commands
from discord.ext import commands
import os
import datetime
from supabase import create_client, Client
import logging
import os
from dotenv import load_dotenv


def owner_or_permissions(**perms):
    async def predicate(ctx):
        if await ctx.bot.is_owner(ctx.author):
            return True
        return await commands.has_permissions(**perms).predicate(ctx)
    return commands.check(predicate)

async def is_moderator_or_owner(interaction: discord.Interaction) -> bool:
    if await interaction.client.is_owner(interaction.user):
        return True
    perms = interaction.user.guild_permissions if isinstance(interaction.user, discord.Member) else None
    return bool(perms and (perms.moderate_members or perms.administrator))


env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
load_dotenv(env_path)
TOKEN = os.getenv('DISCORD_TOKEN')
BOT_DIR = os.path.dirname(os.path.abspath(__file__))
PICS_DIR = os.path.join(os.path.dirname(BOT_DIR), "Pics")

# Punishment cases now live in the same Supabase project the website reads from,
# instead of a local moderation.db SQLite file. SUPABASE_URL can be the same
# project URL the website's VITE_SUPABASE_URL uses (without the VITE_ prefix).
# SUPABASE_SERVICE_ROLE_KEY must be the *service_role* secret key (Project
# Settings -> API in the Supabase dashboard) -- NOT the anon/public key the
# website's frontend uses -- since the bot needs to bypass Row Level Security
# to write cases on behalf of any moderator.
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env for punishment "
        "commands to work (see comment above)."
    )
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

bot = commands.Bot(command_prefix="!", intents=discord.Intents.all())

BLACK = discord.Color(0x000000)
PURPLE = discord.Color(0x800080)
GREEN = discord.Color(0x00FF00)
RED = discord.Color(0xFF0000)
GRAY = discord.Color(0x808080)
TAN = discord.Color(0xD2B48C)
BLUE = discord.Color(0x0000FF)
LIME_GREEN = discord.Color(0x32CD32)
CINYAN = discord.Color(0x00FFFF)
DARK_GREEN = discord.Color(0x006400)
BROWN = discord.Color(0xA52A2A)
ORANGE = discord.Color(0xFFA500)
BEIGE = discord.Color(0xF5F5DC)
WHITE = discord.Color(0xFFFFFF)
YELLOW = discord.Color(0xFFFF00)

UNITS = {
    "grand_commander": {
        "name": "Grand Commander",
        "emoji": "🐦‍⬛",
        "description": "This oversee the whole operation. This is ran by <@1116123489808683079>",
        "color": YELLOW,
    },
    "operations_division": {
        "name": "Operations Division",
        "emoji": "🎯",
        "description": "Masterminds behind mass events. Disciplinary action against high ranking officials and STAFF. This is ran by <@1342952191513591841>",
        "color": RED,
    },
    "support_logistics": {
        "name": "Support & Logistics",
        "emoji": "⚙️",
        "description": "Strategic Developers. Task Force Personnel. Fast Engagement Trainings. Convoy Discipline. Ran by <@1043229774358773790> And <@1342952191513591841>",
        "color": GRAY,
    },
    "capital_division": {
        "name": "Capital Division",
        "emoji": "🏛️",
        "description": "Specialized Units tasked with a variety of things that most companies don't have. Aviation, Contracting, Reconnaissance. Ran By <@1043229774358773790>",
        "color": CINYAN,
    },
    "aviation": {
        "name": "Aviation Unit (Suspension)",
        "emoji": "🚁",
        "description": "Helicopters. Air Transport and Combat. Always ensuring that every advantage is ours. Ran in Capital Division.",
        "color": RED,
    },
    "comet": {
        "name": "C.O.M.E.T. Task Force",
        "emoji": "☄️",
        "description": "Actions speak louder than words. Hard working. Trained for every possible situation. Ran in Support & Logistics.",
        "color": BLACK,
    },
    "contractor": {
        "name": "Contractor Unit",
        "emoji": "🤝",
        "description": "Goes out and tries to get us contracts with businesses and departments. Ran in Capital Division",
        "color": TAN,
    },
    "recon": {
        "name": "Reconnaissance Unit",
        "emoji": "🔭",
        "description": (
            "Recon and ground unit that helps keep eyes in the air and ahead for those doing convoys or sitting at a security spot. "
            "You can use drones, snipers, binoculars, and M4A1. As the recon part you will be the eyes in the skies and protection for ground units. "
            "For the ground units you will assist CBU by staying outside and making sure no one is able to run away. "
            "Uses the van and the bearcat to get there and away safely. "
            "This unit allows Capital Division to grow and bring in more members! Ran in Capital Division."
        ),
        "color": DARK_GREEN,
    },
}


def build_unit_embed(unit_key: str) -> discord.Embed:
    unit = UNITS[unit_key]
    embed = discord.Embed(
        title=f"{unit['emoji']}  {unit['name']}",
        description=unit["description"],
        color=unit["color"],
    )
    embed.set_footer(text="Go up and pick a new unit to learn more!")

    return embed


class UnitSelect(discord.ui.Select):
    def __init__(self):
        options = [
            discord.SelectOption(
                label=data["name"],
                value=key,
                emoji=data["emoji"],
                description=(data["description"][:100] if data["description"] else "No description available."),
            )
            for key, data in UNITS.items()
        ]
        super().__init__(
            placeholder="Select a unit to learn more.",
            min_values=1,
            max_values=1,
            options=options,
            custom_id="unit_select_persistent",
        )

    async def callback(self, interaction: discord.Interaction):
        try:
            selected_key = self.values[0]
            embed = build_unit_embed(selected_key)
            await interaction.response.send_message(embed=embed, ephemeral=True)
        except discord.errors.NotFound:
            pass


class UnitView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)
        self.add_item(UnitSelect())


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("mod-bot")

LOG_CHANNEL_ID = 1518108745987784874

intents = discord.Intents.default()
intents.message_content = True


class ModBot(commands.Bot):
    def __init__(self):
        super().__init__(command_prefix=["!", "?"], intents=intents)

    async def setup_hook(self):
        self.add_view(UnitView())


client = ModBot()


@client.command(name="unit")
async def unit_command(ctx: commands.Context):
    await ctx.message.delete()
    view = UnitView()
    description = (
        "> ### Welcome to **Comet Strategic Operations** divisions page.\n"
        "> We have three divisions for people to look into, and choose from along with a couple of units. "
        "Please keep in mind more units may be added as CSO grows, and gets better! "
        "Click the dropdown menu to get started and learn about our divisions, and units!\n\n"
        ">Grand Commander: <@1116123489808683079>\n"
        ">Operations Division: <@1342952191513591841>\n"
        ">Support & Logistics: N/A\n"
        ">Capital Division: <@1043229774358773790>>\n"
        "> ### Interested in a unit or division?\n"
        
        "> Please make a ticket or attend to the next tryout!\n\n"
        "**Select a unit from the dropdown below to learn more about it.**"
    )
    embed = discord.Embed(
        title="Divisions",
        description=description,
        color=BLACK,
    )
    file = discord.File(os.path.join(PICS_DIR, "divisions.webp"), filename="divisions.webp")
    await ctx.send(file=file, embed=embed, view=view)


@client.command(name="scott")
async def scott_command(ctx: commands.Context):
    await ctx.message.delete()
    embed = discord.Embed(
        title="Scott",
        color=GREEN,
    )
    file = discord.File(os.path.join(PICS_DIR, "scott.webp"), filename="scott.webp")
    embed.set_image(url="attachment://scott.webp")
    await ctx.send(file=file, embed=embed)


@client.command(name="aviation")
async def aviation_command(ctx: commands.Context):
    await ctx.message.delete()
    embed = discord.Embed(
        title="Aviation Unit",
        color=RED,
    )
    file = discord.File(os.path.join(PICS_DIR, "aviation.webp"), filename="aviation.webp")
    embed.set_image(url="attachment://aviation.webp")
    await ctx.send(file=file, embed=embed)


@client.command(name="CMT")
async def cmt_command(ctx: commands.Context):
    await ctx.message.delete()
    embed = discord.Embed(
        title="Comet Medical Team",
        color=PURPLE,
    )
    file = discord.File(os.path.join(PICS_DIR, "cmt.webp"), filename="cmt.webp")
    embed.set_image(url="attachment://cmt.webp")
    await ctx.send(file=file, embed=embed)


@client.command(name="crow")
async def crow_command(ctx: commands.Context):
    await ctx.message.delete()
    embed = discord.Embed(
        title="Crow",
        color=BLUE,
    )
    file = discord.File(os.path.join(PICS_DIR, "crow.webp"), filename="crow.webp")
    embed.set_image(url="attachment://crow.webp")
    await ctx.send(file=file, embed=embed)

@client.command(name="slenderma")
async def slenderma_command(ctx: commands.Context):
    await ctx.message.delete()
    embed = discord.Embed(
        title="Slenderma_tv Cool guy.",
        color=LIME_GREEN,
    )
    file = discord.File(os.path.join(PICS_DIR, "slenderma.webp"), filename="slenderma.webp")
    embed.set_image(url="attachment://slenderma.webp")
    await ctx.send(file=file, embed=embed)

@client.command(name="italy")
async def italy_command(ctx: commands.Context):
    await ctx.message.delete()
    embed = discord.Embed(
        title="Italy Scott Made me Help me.",
        color=ORANGE,
    )
    file = discord.File(os.path.join(PICS_DIR, "italy.webp"), filename="italy.webp")
    embed.set_image(url="attachment://italy.webp")
    await ctx.send(file=file, embed=embed)

@client.command(name="USA")
async def usa_command(ctx: commands.Context):
    await ctx.message.delete()
    embed = discord.Embed(
        title="USA red white and blue.",
        color=RED,
    )
    file = discord.File(os.path.join(PICS_DIR, "usa.webp"), filename="usa.webp")
    embed.set_image(url="attachment://usa.webp")
    await ctx.send(file=file, embed=embed)

@client.command(name="bowie")
async def bowie_command(ctx: commands.Context):
    await ctx.message.delete()
    embed = discord.Embed(
        title="Bowie",
        color=BROWN,
    )
    file = discord.File(os.path.join(PICS_DIR, "bowie.webp"), filename="bowie.webp")
    embed.set_image(url="attachment://bowie.webp")
    await ctx.send(file=file, embed=embed)

@client.command(name="orca")
async def orca_command(ctx: commands.Context):
    await ctx.message.delete()
    embed = discord.Embed(
        title="orca",
        color=RED,
    )
    file = discord.File(os.path.join(PICS_DIR, "orca.gif"), filename="orca.gif")
    embed.set_image(url="attachment://orca.gif")
    await ctx.send(file=file, embed=embed)

@client.command(name="og_cso")
async def og_cso_command(ctx: commands.Context):
    await ctx.message.delete()
    embed = discord.Embed(
        title="OG CSO RIP will be missed.",
        color=WHITE,
    )
    file = discord.File(os.path.join(PICS_DIR, "OG CSO.webp"), filename="OG CSO.webp")
    embed.set_image(url="attachment://OG CSO.webp")
    await ctx.send(file=file, embed=embed)

@client.command(name="new_cso")
async def new_cso_command(ctx: commands.Context):
    await ctx.message.delete()
    embed = discord.Embed(
        title="New CSO",
        color=BLACK,
    )
    file = discord.File(os.path.join(PICS_DIR, "new cso.webp"), filename="new cso.webp")
    embed.set_image(url="attachment://new cso.webp")
    await ctx.send(file=file, embed=embed)

# ── Shutdown ─────────────────────────────────────────────────────────────────

@client.command()
@commands.is_owner()
async def shutdown(ctx):
    await ctx.send("Windows shutting down... Like a good bot should. Goodbye!")
    await client.close()


def get_log_channel(guild: discord.Guild) -> discord.TextChannel | None:
    channel = guild.get_channel(LOG_CHANNEL_ID)
    return channel if isinstance(channel, discord.TextChannel) else None

def discipline_notice(guild_name: str) -> str:
    return (
        f"The High-ranking team of **{guild_name}** has issued you a punishment. "
        "Do not start any drama about this. Arguing will result in further moderation."
    )


def build_punishment_embed(
    case_id: int,
    guild: discord.Guild,
    action: str,
    reason: str,
    appealable: bool,
    signed_name: str,
    staff_member_name: str,
    is_dm: bool = False,
) -> discord.Embed:
    embed = discord.Embed(
        title="Staff Discipline — You have been punished" if is_dm else "Staff Discipline",
        description=discipline_notice(guild.name),
        color=discord.Color.red(),
    )
    thumb = guild_thumbnail(guild)
    if thumb:
        embed.set_thumbnail(url=thumb)

    embed.add_field(name="\U0001F464 | Staff Member", value=staff_member_name, inline=False)
    embed.add_field(name="\u2696\uFE0F | Punishment", value=action, inline=False)
    embed.add_field(name="\U0001F4DD | Reason", value=reason, inline=False)
    embed.add_field(
        name="Appealable",
        value="Yes" if appealable else "No",
        inline=False,
    )
    embed.add_field(name="\U0001F6E1\uFE0F | Signed", value=signed_name, inline=False)

    ts = discord.utils.utcnow()
    embed.set_footer(text=f"Case #{case_id} | {ts.strftime('%B %d, %Y')} at {ts.strftime('%H:%M')} UTC")
    return embed


async def is_moderator_or_owner(interaction: discord.Interaction) -> bool:
    perms = interaction.user.guild_permissions if isinstance(interaction.user, discord.Member) else None
    return bool(perms and (perms.moderate_members or perms.administrator))


def case_footer(case_id: int) -> str:
    ts = discord.utils.utcnow().strftime("%b %d, %Y %H:%M")
    return f"Case #{case_id} | {ts}"


def guild_thumbnail(guild: discord.Guild) -> str | None:
    return guild.icon.url if guild and guild.icon else None


async def create_appeal_ticket(
    guild: discord.Guild, member: discord.Member, case_id: int
) -> discord.TextChannel | None:
    category = discord.utils.get(guild.categories, name="Appeals")
    if category is None:
        try:
            category = await guild.create_category("Appeals")
        except discord.Forbidden:
            category = None

    overwrites = {
        guild.default_role: discord.PermissionOverwrite(view_channel=False),
        member: discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True),
        guild.me: discord.PermissionOverwrite(view_channel=True, send_messages=True, manage_channels=True),
    }
    for role in guild.roles:
        if role.permissions.moderate_members or role.permissions.administrator:
            overwrites[role] = discord.PermissionOverwrite(
                view_channel=True, send_messages=True, read_message_history=True
            )

    safe_name = "".join(c for c in member.name.lower() if c.isalnum() or c == "-") or "member"
    channel_name = f"appeal-{safe_name}-{case_id}"

    try:
        return await guild.create_text_channel(channel_name, category=category, overwrites=overwrites)
    except discord.Forbidden:
        log.warning("Missing permission to create an appeal ticket channel in guild %s", guild.id)
        return None


@client.event
async def on_ready():
    log.info("Logged in as %s (id=%s)", client.user, client.user.id if client.user else "?")

    try:
        for guild in client.guilds:
            try:
                client.tree.copy_global_to(guild=guild)
                await client.tree.sync(guild=guild)
                log.info("Synced application commands for guild %s", guild.id)
            except Exception:
                log.exception("Failed to sync commands for guild %s", guild.id)

        await client.tree.sync()
        log.info("Application commands synced successfully.")
    except Exception:
        log.exception("Failed to sync application commands.")


PUNISHMENT_CHOICES = [
    app_commands.Choice(name="Warning", value="Warning"),
    app_commands.Choice(name="Fire Warning", value="Fire Warning"),
    app_commands.Choice(name="Infraction", value="Infraction"),
    app_commands.Choice(name="Strike", value="Strike"),
    app_commands.Choice(name="Under Investigation", value="Under Investigation"),
    app_commands.Choice(name="Suspension", value="Suspension"),
    app_commands.Choice(name="Termination", value="Termination"),
]

BANNER_PATH = os.path.join(PICS_DIR, "infractions.webp")
BANNER_FILENAME = "infractions.webp"


@client.tree.command(name="punish", description="Punish a member and log a moderation case")
@app_commands.describe(
    member="The member to punish",
    punishment_type="The type of punishment to issue",
    reason="Why this member is being punished",
    appealable="Whether the member is allowed to appeal this case",
    duration_minutes="Timeout length in minutes (only used for Suspension, default 60)",
    proof="Optional proof (screenshot/image/file)",
    text_proof="Optional text proof/evidence",
)
@app_commands.choices(punishment_type=PUNISHMENT_CHOICES)
async def punish(
    interaction: discord.Interaction,
    member: discord.Member,
    punishment_type: app_commands.Choice[str],
    reason: str,
    appealable: bool,
    duration_minutes: app_commands.Range[int, 1, 40320] = 60,
    proof: discord.Attachment = None,
    text_proof: str = None,
):
    if not await is_moderator_or_owner(interaction):
        await interaction.response.send_message(
            "You need the Moderate Members permission to use this command.", ephemeral=True
        )
        return

    if member.top_role >= interaction.user.top_role and interaction.user.id != interaction.guild.owner_id:
        await interaction.response.send_message(
            "You can't punish someone with an equal or higher role than you.", ephemeral=True
        )
        return

    # Acknowledge the interaction immediately. Everything below this line (a possible
    # Discord timeout call, a DB write, and a log-channel send with a file attachment)
    # can easily take longer than Discord's 3-second response window, which is what was
    # causing "CSO Server Management didn't respond in time."
    await interaction.response.defer(ephemeral=True)

    action = punishment_type.value
    try:
        if action == "Suspension":
            until = discord.utils.utcnow() + datetime.timedelta(minutes=duration_minutes)
            await member.timeout(until, reason=f"{reason} (by {interaction.user})")
        # All other punishment types (Warning, Fire Warning, Infraction, Strike,
        # Under Investigation, Termination) are record-only and take no Discord-side action.
    except discord.Forbidden:
        await interaction.followup.send(
            f"I don't have permission to apply a {action.lower()} timeout to that member.", ephemeral=True
        )
        return

    try:
        insert_resp = (
            supabase.table("cases")
            .insert(
                {
                    "guild_id": str(interaction.guild_id),
                    "user_id": str(member.id),
                    "moderator_id": str(interaction.user.id),
                    "reason": reason,
                    "duration_minutes": duration_minutes if action == "Suspension" else None,
                    "created_at": discord.utils.utcnow().isoformat(),
                    "status": "active",
                    "punishment_type": action,
                    "appealable": appealable,
                    "signed_by": str(interaction.user.id),
                }
            )
            .execute()
        )
        case_id = insert_resp.data[0]["id"]
    except Exception:
        log.exception("Failed to insert case into Supabase")
        await interaction.followup.send(
            "Something went wrong saving that case to the database. The punishment was NOT logged — please try again.",
            ephemeral=True,
        )
        return

    signed_name = interaction.user.mention
    staff_member_name = member.mention
    embed = build_punishment_embed(case_id, interaction.guild, action, reason, appealable, signed_name, staff_member_name)
    if proof is not None:
        embed.add_field(name="\U0001F4F7 | Proof", value=f"[View Attachment]({proof.url})", inline=False)
    if text_proof:
        embed.add_field(name="\U0001F4C4 | Text Proof", value=text_proof, inline=False)
    embed.set_image(url=f"attachment://{BANNER_FILENAME}")
    ping = f"||{member.mention}||"

    log_channel = get_log_channel(interaction.guild)
    if log_channel is not None:
        if os.path.exists(BANNER_PATH):
            await log_channel.send(content=ping, embed=embed, file=discord.File(BANNER_PATH, filename=BANNER_FILENAME))
        else:
            await log_channel.send(content=ping, embed=embed)
        await interaction.followup.send(
            f"Case #{case_id} logged in {log_channel.mention}.", ephemeral=True
        )
    else:
        if os.path.exists(BANNER_PATH):
            await interaction.followup.send(
                content=ping, embed=embed, file=discord.File(BANNER_PATH, filename=BANNER_FILENAME)
            )
        else:
            await interaction.followup.send(content=ping, embed=embed)

    try:
        dm_embed = build_punishment_embed(
            case_id, interaction.guild, action, reason, appealable, signed_name, staff_member_name, is_dm=True
        )
        if proof is not None:
            dm_embed.add_field(name="\U0001F4F7 | Proof", value=f"[View Attachment]({proof.url})", inline=False)
        if text_proof:
            dm_embed.add_field(name="\U0001F4C4 | Text Proof", value=text_proof, inline=False)
        if os.path.exists(BANNER_PATH):
            dm_embed.set_image(url=f"attachment://{BANNER_FILENAME}")
            await member.send(embed=dm_embed, file=discord.File(BANNER_PATH, filename=BANNER_FILENAME))
        else:
            await member.send(embed=dm_embed)
    except discord.Forbidden:
        pass


@client.tree.command(name="revoke", description="Forcefully revoke an active punishment")
@app_commands.describe(case_id="The case ID to revoke", reason="Why this case is being revoked")
async def revoke(interaction: discord.Interaction, case_id: int, reason: str = "Revoked."):
    if not await is_moderator_or_owner(interaction):
        await interaction.response.send_message(
            "You need the Moderate Members permission to use this command.", ephemeral=True
        )
        return

    select_resp = (
        supabase.table("cases")
        .select("*")
        .eq("id", case_id)
        .eq("guild_id", str(interaction.guild_id))
        .execute()
    )
    rows = select_resp.data

    if not rows:
        await interaction.response.send_message(f"No case #{case_id} found in this server.", ephemeral=True)
        return
    row = rows[0]

    if row["status"] != "active":
        await interaction.response.send_message(f"Case #{case_id} is already {row['status']}.", ephemeral=True)
        return

    supabase.table("cases").update({"status": "revoked"}).eq("id", case_id).execute()

    member = interaction.guild.get_member(int(row["user_id"]))
    if member is not None and row["punishment_type"] == "Suspension":
        try:
            await member.timeout(None, reason=f"Punishment revoked by {interaction.user}: {reason}")
        except discord.Forbidden:
            pass

    embed = discord.Embed(
        title="\U0001F6E1\uFE0F Case Forcefully Revoked",
        description=f"This case has been revoked by {interaction.user.mention}.",
        color=discord.Color.gold(),
    )
    embed.add_field(name="\U0001F4DD Reason", value=reason, inline=False)
    embed.add_field(name="\U0001F4C4 Result", value="Record cleared.", inline=False)
    embed.set_footer(text=case_footer(case_id))

    ping = f"||{member.mention}||" if member is not None else None
    log_channel = get_log_channel(interaction.guild)
    if log_channel is not None:
        await log_channel.send(content=ping, embed=embed)
        await interaction.response.send_message(
            f"Case #{case_id} revocation logged in {log_channel.mention}.", ephemeral=True
        )
    else:
        await interaction.response.send_message(content=ping, embed=embed)

    if member is not None:
        try:
            await member.send(
                f"Your punishment (case #{case_id}) in **{interaction.guild.name}** has been revoked."
            )
        except discord.Forbidden:
            pass


@client.tree.command(name="view_cases", description="View all moderation cases for a member")
@app_commands.describe(member="The member whose moderation history you want to view")
async def view_cases(interaction: discord.Interaction, member: discord.Member):
    if not await is_moderator_or_owner(interaction):
        await interaction.response.send_message(
            "You need the Moderate Members permission to use this command.", ephemeral=True
        )
        return

    select_resp = (
        supabase.table("cases")
        .select("*")
        .eq("guild_id", str(interaction.guild_id))
        .eq("user_id", str(member.id))
        .order("id", desc=True)
        .execute()
    )
    rows = select_resp.data

    if not rows:
        await interaction.response.send_message(
            f"{member.mention} has no moderation cases in this server.", ephemeral=True
        )
        return

    active_count = sum(1 for row in rows if row["status"] == "active")
    total_count = len(rows)
    punishment_counts = {}
    for row in rows:
        punishment = row["punishment_type"] or "Warning"
        punishment_counts[punishment] = punishment_counts.get(punishment, 0) + 1

    breakdown = ", ".join(f"{name}: {count}" for name, count in punishment_counts.items())
    recent_cases = []
    for row in rows[:10]:
        recent_cases.append(
            f"#{row['id']} · {row['punishment_type']} · {row['status'].title()} · {row['reason']}"
        )

    embed = discord.Embed(
        title=f"🧾 Case History for {member.display_name}",
        color=discord.Color.blue(),
    )
    embed.add_field(name="Total Punishments", value=str(total_count), inline=True)
    embed.add_field(name="Active Punishments", value=str(active_count), inline=True)
    embed.add_field(name="Punishment Breakdown", value=breakdown, inline=False)
    embed.add_field(
        name="Recent Cases",
        value="\n".join(recent_cases)[:1024] or "No recent cases available.",
        inline=False,
    )
    embed.set_footer(text=f"Showing newest {min(len(recent_cases), 10)} of {total_count} cases")

    await interaction.response.send_message(embed=embed, ephemeral=True)


class AppealReviewView(discord.ui.View):
    def __init__(self, case_id: int):
        super().__init__(timeout=None)
        self.case_id = case_id

    async def _resolve(self, interaction: discord.Interaction, approve: bool):
        if not await is_moderator_or_owner(interaction):
            await interaction.response.send_message(
                "You need the Moderate Members permission to review appeals.", ephemeral=True
            )
            return

        select_resp = supabase.table("cases").select("*").eq("id", self.case_id).execute()
        rows = select_resp.data
        if not rows:
            await interaction.response.send_message("That case no longer exists.", ephemeral=True)
            return
        row = rows[0]

        new_appeal_status = "approved" if approve else "denied"
        new_status = "revoked" if approve else row["status"]
        supabase.table("cases").update(
            {"appeal_status": new_appeal_status, "status": new_status}
        ).eq("id", self.case_id).execute()

        guild = interaction.guild
        member = guild.get_member(int(row["user_id"])) if guild else None
        if approve and member is not None and row["punishment_type"] == "Suspension":
            try:
                await member.timeout(None, reason=f"Appeal approved by {interaction.user}")
            except discord.Forbidden:
                pass

        for item in self.children:
            item.disabled = True
        await interaction.response.edit_message(view=self)

        if approve:
            result_embed = discord.Embed(
                title=f"\u2696\uFE0F Case #{self.case_id} Appealed Successfully",
                description=f"This case has been appealed by {interaction.user.mention}.",
                color=discord.Color.green(),
            )
            result_embed.add_field(name="Action Taken", value="Record cleared.", inline=False)
        else:
            result_embed = discord.Embed(
                title=f"\u274C Case #{self.case_id} Appeal Denied",
                description=f"This appeal has been denied by {interaction.user.mention}.",
                color=discord.Color.red(),
            )
        result_embed.set_footer(text=case_footer(self.case_id))
        ping = f"||{member.mention}||" if member is not None else None
        await interaction.followup.send(content=ping, embed=result_embed)

        if member is not None:
            try:
                if approve:
                    await member.send(f"Your appeal for case #{self.case_id} was approved and your punishment was lifted.")
                else:
                    await member.send(f"Your appeal for case #{self.case_id} was denied.")
            except discord.Forbidden:
                pass

    @discord.ui.button(label="Approve", style=discord.ButtonStyle.success)
    async def approve(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self._resolve(interaction, approve=True)

    @discord.ui.button(label="Deny", style=discord.ButtonStyle.danger)
    async def deny(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self._resolve(interaction, approve=False)


@client.tree.command(name="appeal", description="Appeal a moderation case against you")
@app_commands.describe(case_id="The case ID you want to appeal", reason="Why you believe this should be reversed")
async def appeal(interaction: discord.Interaction, case_id: int, reason: str):
    select_resp = (
        supabase.table("cases")
        .select("*")
        .eq("id", case_id)
        .eq("guild_id", str(interaction.guild_id))
        .execute()
    )
    rows = select_resp.data

    if not rows:
        await interaction.response.send_message(f"No case #{case_id} found in this server.", ephemeral=True)
        return
    row = rows[0]

    if str(interaction.user.id) != row["user_id"]:
        await interaction.response.send_message("You can only appeal your own cases.", ephemeral=True)
        return

    if not row["appealable"]:
        await interaction.response.send_message(f"Case #{case_id} is not appealable.", ephemeral=True)
        return

    if row["appeal_status"] == "pending":
        await interaction.response.send_message(f"Case #{case_id} already has a pending appeal.", ephemeral=True)
        return

    supabase.table("cases").update(
        {"appeal_status": "pending", "appeal_reason": reason}
    ).eq("id", case_id).execute()

    channel = await create_appeal_ticket(interaction.guild, interaction.user, case_id)

    embed = discord.Embed(
        title=f"\U0001F4CB Case #{case_id} Appeal",
        color=discord.Color.orange(),
    )
    thumb = guild_thumbnail(interaction.guild)
    if thumb:
        embed.set_thumbnail(url=thumb)
    embed.add_field(name="\U0001F464 Member", value=interaction.user.mention, inline=False)
    embed.add_field(name="\u2696\uFE0F Original Reason", value=row["reason"], inline=False)
    embed.add_field(name="\U0001F4DD Appeal Reason", value=reason, inline=False)
    embed.set_footer(text=case_footer(case_id))

    if channel is not None:
        await channel.send(content=f"||{interaction.user.mention}||", embed=embed, view=AppealReviewView(case_id))
        log_channel = get_log_channel(interaction.guild)
        if log_channel is not None and log_channel.id != channel.id:
            await log_channel.send(
                content=f"||{interaction.user.mention}||",
                embed=embed,
            )
        await interaction.response.send_message(
            f"Your appeal ticket has been created: {channel.mention}", ephemeral=True
        )
    else:
        await interaction.response.send_message(
            "Your appeal was recorded, but I couldn't create a ticket channel for it. "
            "Ask an admin to give me the Manage Channels permission.",
            ephemeral=True,
        )

# ── Sue ──────────────────────────────────────────────────────────────────────

@client.command(name="sue")
async def sue_command(ctx: commands.Context, member: discord.Member):
    await ctx.message.delete()
    embed = discord.Embed(
        title="\u2696\uFE0F Lawsuit Filed",
        description=f"{ctx.author.mention} is suing {member.mention}!",
        color=RED,
    )
    await ctx.send(embed=embed)


@sue_command.error
async def sue_command_error(ctx: commands.Context, error: commands.CommandError):
    if isinstance(error, commands.NotOwner):
        await ctx.send("Only the bot owner can use this command.", delete_after=5)
    elif isinstance(error, commands.MemberNotFound):
        await ctx.send("Couldn't find that member.", delete_after=5)
    elif isinstance(error, commands.MissingRequiredArgument):
        await ctx.send("Usage: `!sue @user`", delete_after=5)
    else:
        raise error

# ── Server mute test ─────────────────────────────────────────────────────────────────────

@client.command(name="join")
async def join_command(ctx: commands.Context):
    if ctx.author.voice is None or ctx.author.voice.channel is None:
        await ctx.send("You need to be in a voice channel for me to join.")
        return

    if ctx.voice_client is not None:
        if ctx.voice_client.channel.id == ctx.author.voice.channel.id:
            await ctx.send(f"I’m already in {ctx.author.voice.channel.mention}.")
            return

        await ctx.voice_client.move_to(ctx.author.voice.channel)
        await ctx.send(f"Moved to {ctx.author.voice.channel.mention}.")
        return

    await ctx.author.voice.channel.connect(
        reconnect=True,
        self_deaf=True,
        self_mute=False,
    )
    await ctx.send(f"Joined {ctx.author.voice.channel.mention}.")

@client.command(name="leave")
async def leave_command(ctx: commands.Context):
    vc = ctx.voice_client
    if vc is None:
        await ctx.send("I’m not in a voice channel.")
        return

    await vc.disconnect()
    await ctx.send("Left the voice channel.")

@client.command(name="server")
@owner_or_permissions(mute_members=True, deafen_members=True)
async def server_command(ctx: commands.Context, action: str, member: discord.Member):
    action = action.lower()

    if action == "mute":
        await member.edit(mute=True, reason=f"Server mute requested by {ctx.author}")
        await ctx.send(f"{member.mention} has been server muted.")
        return

    if action == "unmute":
        await member.edit(mute=False, reason=f"Server unmute requested by {ctx.author}")
        await ctx.send(f"{member.mention} has been server unmuted.")
        return

    if action == "deafen":
        await member.edit(deafen=True, reason=f"Server deafen requested by {ctx.author}")
        await ctx.send(f"{member.mention} has been server deafened.")
        return

    if action == "undeafen":
        await member.edit(deafen=False, reason=f"Server undeafen requested by {ctx.author}")
        await ctx.send(f"{member.mention} has been server undeafened.")
        return

    await ctx.send(
        "Usage: `!server mute @user`, `!server unmute @user`, "
        "`!server deafen @user`, or `!server undeafen @user`"
    )

@server_command.error
async def server_command_error(ctx: commands.Context, error: commands.CommandError):
    if isinstance(error, commands.MissingPermissions):
        await ctx.send(
            "You need `Mute Members` and `Deafen Members` permissions to use this command."
        )
    elif isinstance(error, commands.MemberNotFound):
        await ctx.send("Couldn't find that member.")
    elif isinstance(error, commands.MissingRequiredArgument):
        await ctx.send(
            "Usage: `!server mute @user`, `!server unmute @user`, "
            "`!server deafen @user`, or `!server undeafen @user`"
        )
    else:
        raise error

# ── Amendments ───────────────────────────────────────────────────────────────
# Full text source: National Archives transcriptions
#   https://www.archives.gov/founding-docs/bill-of-rights-transcript   (I-X)
#   https://www.archives.gov/founding-docs/amendments-11-27            (XI-XXVII)

AMENDMENTS = [
    ("I", "1791", "Congress shall make no law respecting an establishment of religion, or "
     "prohibiting the free exercise thereof; or abridging the freedom of speech, or of the "
     "press; or the right of the people peaceably to assemble, and to petition the Government "
     "for a redress of grievances."),
    ("II", "1791", "A well regulated Militia, being necessary to the security of a free State, "
     "the right of the people to keep and bear Arms, shall not be infringed."),
    ("III", "1791", "No Soldier shall, in time of peace be quartered in any house, without the "
     "consent of the Owner, nor in time of war, but in a manner to be prescribed by law."),
    ("IV", "1791", "The right of the people to be secure in their persons, houses, papers, and "
     "effects, against unreasonable searches and seizures, shall not be violated, and no "
     "Warrants shall issue, but upon probable cause, supported by Oath or affirmation, and "
     "particularly describing the place to be searched, and the persons or things to be seized."),
    ("V", "1791", "No person shall be held to answer for a capital, or otherwise infamous crime, "
     "unless on a presentment or indictment of a Grand Jury, except in cases arising in the "
     "land or naval forces, or in the Militia, when in actual service in time of War or public "
     "danger; nor shall any person be subject for the same offence to be twice put in jeopardy "
     "of life or limb; nor shall be compelled in any criminal case to be a witness against "
     "himself, nor be deprived of life, liberty, or property, without due process of law; nor "
     "shall private property be taken for public use, without just compensation."),
    ("VI", "1791", "In all criminal prosecutions, the accused shall enjoy the right to a speedy "
     "and public trial, by an impartial jury of the State and district wherein the crime shall "
     "have been committed, which district shall have been previously ascertained by law, and to "
     "be informed of the nature and cause of the accusation; to be confronted with the "
     "witnesses against him; to have compulsory process for obtaining witnesses in his favor, "
     "and to have the Assistance of Counsel for his defence."),
    ("VII", "1791", "In Suits at common law, where the value in controversy shall exceed twenty "
     "dollars, the right of trial by jury shall be preserved, and no fact tried by a jury, "
     "shall be otherwise re-examined in any Court of the United States, than according to the "
     "rules of the common law."),
    ("VIII", "1791", "Excessive bail shall not be required, nor excessive fines imposed, nor "
     "cruel and unusual punishments inflicted."),
    ("IX", "1791", "The enumeration in the Constitution, of certain rights, shall not be "
     "construed to deny or disparage others retained by the people."),
    ("X", "1791", "The powers not delegated to the United States by the Constitution, nor "
     "prohibited by it to the States, are reserved to the States respectively, or to the "
     "people."),
    ("XI", "1795", "The Judicial power of the United States shall not be construed to extend to "
     "any suit in law or equity, commenced or prosecuted against one of the United States by "
     "Citizens of another State, or by Citizens or Subjects of any Foreign State."),
    ("XII", "1804", "The Electors shall meet in their respective states and vote by ballot for "
     "President and Vice-President, one of whom, at least, shall not be an inhabitant of the "
     "same state with themselves; they shall name in their ballots the person voted for as "
     "President, and in distinct ballots the person voted for as Vice-President, and they shall "
     "make distinct lists of all persons voted for as President, and of all persons voted for "
     "as Vice-President, and of the number of votes for each, which lists they shall sign and "
     "certify, and transmit sealed to the seat of the government of the United States, directed "
     "to the President of the Senate; -- the President of the Senate shall, in the presence of "
     "the Senate and House of Representatives, open all the certificates and the votes shall "
     "then be counted; -- The person having the greatest number of votes for President, shall "
     "be the President, if such number be a majority of the whole number of Electors appointed; "
     "and if no person have such majority, then from the persons having the highest numbers not "
     "exceeding three on the list of those voted for as President, the House of Representatives "
     "shall choose immediately, by ballot, the President. But in choosing the President, the "
     "votes shall be taken by states, the representation from each state having one vote; a "
     "quorum for this purpose shall consist of a member or members from two-thirds of the "
     "states, and a majority of all the states shall be necessary to a choice. [This clause was "
     "superseded by section 3 of the 20th amendment.] The person having the greatest number of "
     "votes as Vice-President, shall be the Vice-President, if such number be a majority of the "
     "whole number of Electors appointed, and if no person have a majority, then from the two "
     "highest numbers on the list, the Senate shall choose the Vice-President; a quorum for the "
     "purpose shall consist of two-thirds of the whole number of Senators, and a majority of "
     "the whole number shall be necessary to a choice. But no person constitutionally "
     "ineligible to the office of President shall be eligible to that of Vice-President of the "
     "United States."),
    ("XIII", "1865", "Section 1. Neither slavery nor involuntary servitude, except as a "
     "punishment for crime whereof the party shall have been duly convicted, shall exist "
     "within the United States, or any place subject to their jurisdiction.\n\nSection 2. "
     "Congress shall have power to enforce this article by appropriate legislation."),
    ("XIV", "1868", "Section 1. All persons born or naturalized in the United States, and "
     "subject to the jurisdiction thereof, are citizens of the United States and of the State "
     "wherein they reside. No State shall make or enforce any law which shall abridge the "
     "privileges or immunities of citizens of the United States; nor shall any State deprive "
     "any person of life, liberty, or property, without due process of law; nor deny to any "
     "person within its jurisdiction the equal protection of the laws.\n\nSection 2. "
     "Representatives shall be apportioned among the several States according to their "
     "respective numbers, counting the whole number of persons in each State, excluding "
     "Indians not taxed. But when the right to vote at any election for the choice of electors "
     "for President and Vice-President of the United States, Representatives in Congress, the "
     "Executive and Judicial officers of a State, or the members of the Legislature thereof, is "
     "denied to any of the male inhabitants of such State, being twenty-one years of age [changed "
     "by section 1 of the 26th amendment], and citizens of the United States, or in any way "
     "abridged, except for participation in rebellion, or other crime, the basis of "
     "representation therein shall be reduced in the proportion which the number of such male "
     "citizens shall bear to the whole number of male citizens twenty-one years of age in such "
     "State.\n\nSection 3. No person shall be a Senator or Representative in Congress, or "
     "elector of President and Vice-President, or hold any office, civil or military, under the "
     "United States, or under any State, who, having previously taken an oath, as a member of "
     "Congress, or as an officer of the United States, or as a member of any State legislature, "
     "or as an executive or judicial officer of any State, to support the Constitution of the "
     "United States, shall have engaged in insurrection or rebellion against the same, or given "
     "aid or comfort to the enemies thereof. But Congress may by a vote of two-thirds of each "
     "House, remove such disability.\n\nSection 4. The validity of the public debt of the United "
     "States, authorized by law, including debts incurred for payment of pensions and bounties "
     "for services in suppressing insurrection or rebellion, shall not be questioned. But "
     "neither the United States nor any State shall assume or pay any debt or obligation "
     "incurred in aid of insurrection or rebellion against the United States, or any claim for "
     "the loss or emancipation of any slave; but all such debts, obligations and claims shall be "
     "held illegal and void.\n\nSection 5. The Congress shall have power to enforce, by "
     "appropriate legislation, the provisions of this article."),
    ("XV", "1870", "Section 1. The right of citizens of the United States to vote shall not be "
     "denied or abridged by the United States or by any State on account of race, color, or "
     "previous condition of servitude.\n\nSection 2. The Congress shall have power to enforce "
     "this article by appropriate legislation."),
    ("XVI", "1913", "The Congress shall have power to lay and collect taxes on incomes, from "
     "whatever source derived, without apportionment among the several States, and without "
     "regard to any census or enumeration."),
    ("XVII", "1913", "The Senate of the United States shall be composed of two Senators from "
     "each State, elected by the people thereof, for six years; and each Senator shall have one "
     "vote. The electors in each State shall have the qualifications requisite for electors of "
     "the most numerous branch of the State legislatures.\n\nWhen vacancies happen in the "
     "representation of any State in the Senate, the executive authority of such State shall "
     "issue writs of election to fill such vacancies: Provided, That the legislature of any "
     "State may empower the executive thereof to make temporary appointments until the people "
     "fill the vacancies by election as the legislature may direct.\n\nThis amendment shall not "
     "be so construed as to affect the election or term of any Senator chosen before it becomes "
     "valid as part of the Constitution."),
    ("XVIII", "1919 (repealed 1933)", "Section 1. After one year from the ratification of this "
     "article the manufacture, sale, or transportation of intoxicating liquors within, the "
     "importation thereof into, or the exportation thereof from the United States and all "
     "territory subject to the jurisdiction thereof for beverage purposes is hereby "
     "prohibited.\n\nSection 2. The Congress and the several States shall have concurrent power "
     "to enforce this article by appropriate legislation.\n\nSection 3. This article shall be "
     "inoperative unless it shall have been ratified as an amendment to the Constitution by the "
     "legislatures of the several States, as provided in the Constitution, within seven years "
     "from the date of the submission hereof to the States by the Congress."),
    ("XIX", "1920", "The right of citizens of the United States to vote shall not be denied or "
     "abridged by the United States or by any State on account of sex.\n\nCongress shall have "
     "power to enforce this article by appropriate legislation."),
    ("XX", "1933", "Section 1. The terms of the President and Vice President shall end at noon "
     "on the 20th day of January, and the terms of Senators and Representatives at noon on the "
     "3d day of January, of the years in which such terms would have ended if this article had "
     "not been ratified; and the terms of their successors shall then begin.\n\nSection 2. The "
     "Congress shall assemble at least once in every year, and such meeting shall begin at noon "
     "on the 3d day of January, unless they shall by law appoint a different day.\n\nSection 3. "
     "If, at the time fixed for the beginning of the term of the President, the President elect "
     "shall have died, the Vice President elect shall become President. If a President shall "
     "not have been chosen before the time fixed for the beginning of his term, or if the "
     "President elect shall have failed to qualify, then the Vice President elect shall act as "
     "President until a President shall have qualified; and the Congress may by law provide for "
     "the case wherein neither a President elect nor a Vice President elect shall have "
     "qualified, declaring who shall then act as President, or the manner in which one who is "
     "to act shall be selected, and such person shall act accordingly until a President or Vice "
     "President shall have qualified.\n\nSection 4. The Congress may by law provide for the case "
     "of the death of any of the persons from whom the House of Representatives may choose a "
     "President whenever the right of choice shall have devolved upon them, and for the case of "
     "the death of any of the persons from whom the Senate may choose a Vice President whenever "
     "the right of choice shall have devolved upon them.\n\nSection 5. Sections 1 and 2 shall "
     "take effect on the 15th day of October following the ratification of this article."
     "\n\nSection 6. This article shall be inoperative unless it shall have been ratified as an "
     "amendment to the Constitution by the legislatures of three-fourths of the several States "
     "within seven years from the date of its submission."),
    ("XXI", "1933", "Section 1. The eighteenth article of amendment to the Constitution of the "
     "United States is hereby repealed.\n\nSection 2. The transportation or importation into any "
     "State, Territory, or possession of the United States for delivery or use therein of "
     "intoxicating liquors, in violation of the laws thereof, is hereby prohibited.\n\nSection 3. "
     "This article shall be inoperative unless it shall have been ratified as an amendment to "
     "the Constitution by conventions in the several States, as provided in the Constitution, "
     "within seven years from the date of the submission hereof to the States by the Congress."),
    ("XXII", "1951", "Section 1. No person shall be elected to the office of the President more "
     "than twice, and no person who has held the office of President, or acted as President, "
     "for more than two years of a term to which some other person was elected President shall "
     "be elected to the office of the President more than once. But this Article shall not "
     "apply to any person holding the office of President when this Article was proposed by "
     "the Congress, and shall not prevent any person who may be holding the office of President, "
     "or acting as President, during the term within which this Article becomes operative from "
     "holding the office of President or acting as President during the remainder of such term."
     "\n\nSection 2. This article shall be inoperative unless it shall have been ratified as an "
     "amendment to the Constitution by the legislatures of three-fourths of the several States "
     "within seven years from the date of its submission to the States by the Congress."),
    ("XXIII", "1961", "Section 1. The District constituting the seat of Government of the United "
     "States shall appoint in such manner as the Congress may direct: A number of electors of "
     "President and Vice President equal to the whole number of Senators and Representatives in "
     "Congress to which the District would be entitled if it were a State, but in no event more "
     "than the least populous State; they shall be in addition to those appointed by the "
     "States, but they shall be considered, for the purposes of the election of President and "
     "Vice President, to be electors appointed by a State; and they shall meet in the District "
     "and perform such duties as provided by the twelfth article of amendment.\n\nSection 2. The "
     "Congress shall have power to enforce this article by appropriate legislation."),
    ("XXIV", "1964", "Section 1. The right of citizens of the United States to vote in any "
     "primary or other election for President or Vice President, for electors for President or "
     "Vice President, or for Senator or Representative in Congress, shall not be denied or "
     "abridged by the United States or any State by reason of failure to pay any poll tax or "
     "other tax.\n\nSection 2. The Congress shall have power to enforce this article by "
     "appropriate legislation."),
    ("XXV", "1967", "Section 1. In case of the removal of the President from office or of his "
     "death or resignation, the Vice President shall become President.\n\nSection 2. Whenever "
     "there is a vacancy in the office of the Vice President, the President shall nominate a "
     "Vice President who shall take office upon confirmation by a majority vote of both Houses "
     "of Congress.\n\nSection 3. Whenever the President transmits to the President pro tempore "
     "of the Senate and the Speaker of the House of Representatives his written declaration "
     "that he is unable to discharge the powers and duties of his office, and until he transmits "
     "to them a written declaration to the contrary, such powers and duties shall be discharged "
     "by the Vice President as Acting President.\n\nSection 4. Whenever the Vice President and a "
     "majority of either the principal officers of the executive departments or of such other "
     "body as Congress may by law provide, transmit to the President pro tempore of the Senate "
     "and the Speaker of the House of Representatives their written declaration that the "
     "President is unable to discharge the powers and duties of his office, the Vice President "
     "shall immediately assume the powers and duties of the office as Acting President. "
     "Thereafter, when the President transmits to the President pro tempore of the Senate and "
     "the Speaker of the House of Representatives his written declaration that no inability "
     "exists, he shall resume the powers and duties of his office unless the Vice President and "
     "a majority of either the principal officers of the executive department or of such other "
     "body as Congress may by law provide, transmit within four days to the President pro "
     "tempore of the Senate and the Speaker of the House of Representatives their written "
     "declaration that the President is unable to discharge the powers and duties of his "
     "office. Thereupon Congress shall decide the issue, assembling within forty-eight hours "
     "for that purpose if not in session. If the Congress, within twenty-one days after receipt "
     "of the latter written declaration, or, if Congress is not in session, within twenty-one "
     "days after Congress is required to assemble, determines by two-thirds vote of both Houses "
     "that the President is unable to discharge the powers and duties of his office, the Vice "
     "President shall continue to discharge the same as Acting President; otherwise, the "
     "President shall resume the powers and duties of his office."),
    ("XXVI", "1971", "Section 1. The right of citizens of the United States, who are eighteen "
     "years of age or older, to vote shall not be denied or abridged by the United States or by "
     "any State on account of age.\n\nSection 2. The Congress shall have power to enforce this "
     "article by appropriate legislation."),
    ("XXVII", "1992 (proposed 1789)", "No law, varying the compensation for the services of the "
     "Senators and Representatives, shall take effect, until an election of Representatives "
     "shall have intervened."),
]


def _build_amendment_embeds() -> list[discord.Embed]:
    embeds = []
    for numeral, year, text in AMENDMENTS:
        embed = discord.Embed(
            title=f"Amendment {numeral} ({year})",
            description=text,
            color=discord.Color.dark_blue(),
        )
        embeds.append(embed)
    return embeds


async def _send_amendments_in_batches(destination, embeds: list[discord.Embed]) -> None:
    """Groups embeds into messages, respecting Discord's 10-embeds-per-message
    and ~6000-characters-per-message limits."""
    batch: list[discord.Embed] = []
    running_len = 0
    for embed in embeds:
        embed_len = len(embed.title or "") + len(embed.description or "")
        if batch and (len(batch) >= 10 or running_len + embed_len > 5500):
            await destination.send(embeds=batch)
            batch = []
            running_len = 0
        batch.append(embed)
        running_len += embed_len
    if batch:
        await destination.send(embeds=batch)


@client.command(name="amendments")
async def amendments_command(ctx: commands.Context):
    try:
        await ctx.author.send("**The 27 Amendments to the U.S. Constitution**")
        await _send_amendments_in_batches(ctx.author, _build_amendment_embeds())
    except discord.Forbidden:
        await ctx.send(
            f"{ctx.author.mention} I couldn't DM you the amendments — check your "
            "privacy settings allow direct messages from server members.",
            delete_after=15,
        )
        return

    try:
        await ctx.message.delete()
    except discord.Forbidden:
        pass

    await ctx.send(
        f"{ctx.author.mention} 📬 Sent you the amendments in your DMs.",
        delete_after=10,
    )


client.run(TOKEN)
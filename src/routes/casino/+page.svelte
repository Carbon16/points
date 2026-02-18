<script lang="ts">
	import { goto } from '$app/navigation';
</script>

<div class="casino-container">
	<header class="header">
		<h1>Casino</h1>
		<p class="subtitle">Choose your game</p>
	</header>

	<div class="games-grid">
		<button class="game-card poker" onclick={() => goto('/casino/poker')}>
			<div class="icon">
				<ion-icon name="card-outline"></ion-icon>
			</div>
			<div class="info">
				<h2>Texas Hold'em</h2>
				<p>Classic No-Limit Hold'em</p>
			</div>
		</button>

		<button class="game-card dice" onclick={() => goto('/casino/dice')}>
			<div class="icon">
				<ion-icon name="cube-outline"></ion-icon>
			</div>
			<div class="info">
				<h2>Liar's Dice</h2>
				<p>Bluff your way to victory</p>
			</div>
		</button>

		<button class="game-card draw" onclick={() => goto('/casino/draw')}>
			<div class="icon">
				<ion-icon name="heart-outline"></ion-icon>
			</div>
			<div class="info">
				<h2>Draw</h2>
				<p>Spend your hard earned points...</p>
			</div>
		</button>
	</div>
</div>

<style>
	.casino-container {
		padding: 20px;
		max-width: 600px;
		margin: 0 auto;
	}

	.header {
		text-align: center;
		margin-bottom: 40px;
	}

	h1 {
		font-size: 2.5rem;
		font-weight: 800;
		background: linear-gradient(135deg, #fff 0%, #a5b4fc 100%);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		margin: 0;
	}

	.subtitle {
		color: var(--text-secondary);
		margin-top: 8px;
	}

	.games-grid {
		display: grid;
		gap: 20px;
		grid-template-columns: 1fr;
	}

	.game-card {
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 24px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 16px;
		cursor: pointer;
		transition: all 0.3s ease;
		text-align: left;
		width: 100%;
	}

	.game-card:hover {
		background: rgba(255, 255, 255, 0.06);
		transform: translateY(-2px);
		border-color: rgba(255, 255, 255, 0.1);
	}

	.game-card.poker:hover {
		box-shadow: 0 0 30px rgba(99, 102, 241, 0.15);
		border-color: rgba(99, 102, 241, 0.3);
	}

	.game-card.dice:hover {
		box-shadow: 0 0 30px rgba(236, 72, 153, 0.15);
		border-color: rgba(236, 72, 153, 0.3);
	}

	.icon {
		font-size: 3rem;
		color: var(--text-secondary);
		transition: all 0.3s ease;
	}

	.game-card:hover .icon {
		transform: scale(1.1) rotate(-5deg);
		color: #fff;
	}

	.info h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
		color: #fff;
	}

	.info p {
		margin: 4px 0 0 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}
</style>

import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class File {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column()
    slot!: number;

    @Column()
    timestamp!: Date;

    @Column({ nullable: true })
    file_id?: string;

    @Column({ nullable: true })
    name?: string;

    @Column({ nullable: true })
    weight?: number;

    @Column({ nullable: true })
    file_parent_id?: string;

    @Column({ nullable: true })
    cid?: string;

    @Column({ nullable: true })
    typ?: string;

    @Column({ nullable: true })
    from?: string;

    @Column({ nullable: true })
    to?: string;
}
